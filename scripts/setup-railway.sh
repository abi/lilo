#!/usr/bin/env bash

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
ENV_FILE=".env.prod"

print_header() {
  printf '\n%s\n' "== $1 =="
}

print_note() {
  printf '%s\n' "$1"
}

fail() {
  printf '%s\n' "[$SCRIPT_NAME] $1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

detect_github_repository_slug() {
  command -v git >/dev/null 2>&1 || return 0

  local remote_url
  remote_url="$(git config --get remote.origin.url 2>/dev/null || true)"

  case "$remote_url" in
    git@github.com:*)
      remote_url="${remote_url#git@github.com:}"
      ;;
    https://github.com/*)
      remote_url="${remote_url#https://github.com/}"
      ;;
    http://github.com/*)
      remote_url="${remote_url#http://github.com/}"
      ;;
    *)
      return 0
      ;;
  esac

  printf '%s' "${remote_url%.git}"
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

prompt() {
  local label="$1"
  local default_value="${2:-}"
  local value

  if [[ -n "$default_value" ]]; then
    read -r -p "$label [$default_value]: " value
    value="$(trim "${value:-$default_value}")"
  else
    read -r -p "$label: " value
    value="$(trim "$value")"
  fi

  printf '%s' "$value"
}

railway_cmd() {
  printf -- '->'
  for arg in "$@"; do
    printf ' %q' "$arg"
  done
  printf '\n'
  railway "$@"
}

set_variable() {
  local key="$1"
  local value="$2"
  local service="${3:-}"
  local environment="${4:-}"

  [[ -n "$value" ]] || return 0

  local cmd=(variable set "$key" --stdin)
  if [[ -n "$service" ]]; then
    cmd+=(-s "$service")
  fi
  if [[ -n "$environment" ]]; then
    cmd+=(-e "$environment")
  fi

  printf -- '-> %q' railway
  for arg in "${cmd[@]}"; do
    printf ' %q' "$arg"
  done
  printf ' <hidden>\n'
  printf '%s' "$value" | railway "${cmd[@]}"
}

railway_capture() {
  printf -- '->'
  for arg in "$@"; do
    printf ' %q' "$arg"
  done
  printf '\n'
  railway "$@"
}

set_variables_batch_from_env() {
  local file="${1:-$ENV_FILE}"
  local -a cmd=(variable set)
  local line key value

  [[ -f "$file" ]] || fail "Missing $file"

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "${line#\#}" != "$line" ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    cmd+=("${key}=${value}")
  done < "$file"

  if [[ "${#cmd[@]}" -le 2 ]]; then
    fail "No variables found in $file"
  fi

  railway_cmd "${cmd[@]}"
}

maybe_set_variable() {
  local key="$1"
  local value="$2"
  local service="$3"
  local environment="$4"

  if [[ -n "$value" ]]; then
    set_variable "$key" "$value" "$service" "$environment"
  fi
}

read_env_value() {
  local key="$1"
  local file="${2:-$ENV_FILE}"

  [[ -f "$file" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "${line#\#}" != "$line" ]] && continue
    [[ "$line" == "$key="* ]] || continue
    printf '%s' "${line#*=}"
    return 0
  done < "$file"
}

upsert_env_value() {
  local key="$1"
  local value="$2"
  local file="${3:-$ENV_FILE}"
  local temp_file
  temp_file="$(mktemp)"
  local found="false"

  if [[ -f "$file" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      line="${line%$'\r'}"
      if [[ "$line" == "$key="* ]]; then
        printf '%s=%s\n' "$key" "$value" >> "$temp_file"
        found="true"
      else
        printf '%s\n' "$line" >> "$temp_file"
      fi
    done < "$file"
  fi

  if [[ "$found" != "true" ]]; then
    if [[ -s "$temp_file" ]]; then
      printf '\n' >> "$temp_file"
    fi
    printf '%s=%s\n' "$key" "$value" >> "$temp_file"
  fi

  mv "$temp_file" "$file"
}

generate_auth_password() {
  python3 - <<'PY'
import secrets
import string

alphabet = string.ascii_letters + string.digits
print("".join(secrets.choice(alphabet) for _ in range(20)))
PY
}

require_command railway
require_command openssl
require_command python3
[[ -f "$ENV_FILE" ]] || fail "Missing $ENV_FILE"
default_repo_slug="$(detect_github_repository_slug)"
default_repo_slug="${default_repo_slug:-your-github-user-or-org/lilo}"

print_header "Railway Setup Wizard"
print_note "This wizard links to the existing Railway project named lilo, creates a new service from a GitHub repository, loads deployment variables from $ENV_FILE, attaches a /data volume, and generates a public domain."

if ! railway whoami >/dev/null 2>&1; then
  print_note "Railway CLI is not logged in yet. We'll open the Railway login flow first."
  railway_cmd login
fi

print_header "Repository"
repo_slug="$(prompt "GitHub repository slug to connect" "$default_repo_slug")"
[[ -n "$repo_slug" ]] || fail "GitHub repository slug is required"
print_note "GitHub access to $repo_slug must already be authorized in Railway."

print_header "Project"
print_note "We'll now link this directory to the existing Railway project named lilo."
print_note "If Railway shows a project picker, choose lilo."
railway_cmd link

print_header "Service"
print_note "Creating a new Railway service from $repo_slug."
railway_cmd add -r "$repo_slug"

print_header "Runtime Paths"
port="8080"
volume_mount_path="/data"
workspace_dir="/data/workspace"
sessions_dir="/data/sessions"
print_note "Using fixed defaults:"
print_note "  PORT=$port"
print_note "  volume mount path=$volume_mount_path"
print_note "  LILO_WORKSPACE_DIR=$workspace_dir"
print_note "  LILO_SESSIONS_DIR=$sessions_dir"

print_header "Environment"
print_note "Loading Railway variables from $ENV_FILE."
lilo_auth_password="$(generate_auth_password)"
lilo_auth_session_secret="$(openssl rand -hex 32)"
upsert_env_value "LILO_AUTH_PASSWORD" "$lilo_auth_password" "$ENV_FILE"
upsert_env_value "LILO_AUTH_SESSION_SECRET" "$lilo_auth_session_secret" "$ENV_FILE"
print_note "Generated fresh auth credentials and wrote them to $ENV_FILE."

print_header "Applying Railway Configuration"
set_variables_batch_from_env "$ENV_FILE"

volume_cmd=(volume add --mount-path "$volume_mount_path")
railway_cmd "${volume_cmd[@]}"

domain_cmd=(domain --port "$port")
domain_output="$(railway_capture "${domain_cmd[@]}")"
printf '%s\n' "$domain_output"
if command -v rg >/dev/null 2>&1; then
  domain_url="$(printf '%s\n' "$domain_output" | rg -o 'https://[^[:space:]]+' | tail -n 1 || true)"
else
  domain_url="$(printf '%s\n' "$domain_output" | grep -Eo 'https://[^[:space:]]+' | tail -n 1 || true)"
fi

print_header "Done"
print_note "URL: ${domain_url:-<not found in Railway output>}"
print_note "Password: $lilo_auth_password"
