/**
 * Search + display metadata for the most commonly searched timezones.
 *
 * `Intl.supportedValuesOf("timeZone")` returns every IANA zone (400+), but
 * their canonical IDs often don't match how people search. "Asia/Kolkata"
 * covers all of India, but a user typing "india", "mumbai", or "delhi" would
 * never find it because the label derived from the ID is just "Kolkata".
 *
 * We augment the search for a curated set of zones with:
 *   - `country`: shown next to the city in the list, used as a search keyword
 *   - `aliases`: extra search keywords (other cities, abbreviations)
 *
 * Entries only need to exist for zones where the default label + ID aren't
 * enough on their own. Zones not in this map fall back to their IANA label.
 *
 * Some browsers return legacy IANA names (e.g. Asia/Calcutta instead of
 * Asia/Kolkata). We register both under the same metadata so search works
 * regardless of which name the runtime returns.
 */

export interface TimezoneMeta {
  country?: string;
  aliases?: string[];
}

// Shared metadata objects — referenced by both modern and legacy IANA IDs
// where applicable, so each zone's search keywords live in one place.
const META_INDIA: TimezoneMeta = {
  country: "India",
  aliases: [
    "India",
    "Mumbai",
    "Bombay",
    "Delhi",
    "New Delhi",
    "Bangalore",
    "Bengaluru",
    "Chennai",
    "Madras",
    "Hyderabad",
    "Pune",
    "Ahmedabad",
    "Kolkata",
    "Calcutta",
    "IST",
  ],
};

const META_VIETNAM: TimezoneMeta = {
  country: "Vietnam",
  aliases: ["Saigon", "Ho Chi Minh", "Hanoi", "ICT"],
};

const META_MYANMAR: TimezoneMeta = {
  country: "Myanmar",
  aliases: ["Burma", "Rangoon", "Yangon", "MMT"],
};

const META_NEPAL: TimezoneMeta = {
  country: "Nepal",
  aliases: ["Kathmandu", "Katmandu", "NPT"],
};

const META_UKRAINE: TimezoneMeta = {
  country: "Ukraine",
  aliases: ["Kyiv", "Kiev", "EET", "EEST"],
};

const META_ARGENTINA: TimezoneMeta = {
  country: "Argentina",
  aliases: ["Buenos Aires", "ART"],
};

export const TIMEZONE_META: Record<string, TimezoneMeta> = {
  // India (both legacy Asia/Calcutta and modern Asia/Kolkata)
  "Asia/Kolkata": META_INDIA,
  "Asia/Calcutta": META_INDIA,

  // Vietnam (legacy Asia/Saigon / modern Asia/Ho_Chi_Minh)
  "Asia/Ho_Chi_Minh": META_VIETNAM,
  "Asia/Saigon": META_VIETNAM,

  // Myanmar
  "Asia/Yangon": META_MYANMAR,
  "Asia/Rangoon": META_MYANMAR,

  // Nepal
  "Asia/Kathmandu": META_NEPAL,
  "Asia/Katmandu": META_NEPAL,

  // Ukraine
  "Europe/Kyiv": META_UKRAINE,
  "Europe/Kiev": META_UKRAINE,

  // Argentina
  "America/Buenos_Aires": META_ARGENTINA,
  "America/Argentina/Buenos_Aires": META_ARGENTINA,

  // Asia
  "Asia/Tokyo": { country: "Japan", aliases: ["Japan", "Osaka", "Kyoto", "JST"] },
  "Asia/Shanghai": { country: "China", aliases: ["China", "Beijing", "Guangzhou", "Shenzhen", "CST China"] },
  "Asia/Hong_Kong": { country: "Hong Kong", aliases: ["HKT"] },
  "Asia/Singapore": { country: "Singapore", aliases: ["SGT"] },
  "Asia/Seoul": { country: "South Korea", aliases: ["Korea", "KST"] },
  "Asia/Bangkok": { country: "Thailand", aliases: ["Thailand", "ICT"] },
  "Asia/Jakarta": { country: "Indonesia", aliases: ["Indonesia", "WIB"] },
  "Asia/Manila": { country: "Philippines", aliases: ["Philippines", "PHT"] },
  "Asia/Kuala_Lumpur": { country: "Malaysia", aliases: ["Malaysia", "MYT"] },
  "Asia/Dubai": { country: "UAE", aliases: ["United Arab Emirates", "Abu Dhabi", "GST"] },
  "Asia/Riyadh": { country: "Saudi Arabia", aliases: ["Saudi Arabia", "AST"] },
  "Asia/Jerusalem": { country: "Israel", aliases: ["Israel", "Tel Aviv", "IDT"] },
  "Asia/Karachi": { country: "Pakistan", aliases: ["Pakistan", "Lahore", "Islamabad", "PKT"] },
  "Asia/Dhaka": { country: "Bangladesh", aliases: ["Bangladesh", "BST Bangladesh"] },
  "Asia/Taipei": { country: "Taiwan", aliases: ["Taiwan"] },
  "Asia/Tehran": { country: "Iran", aliases: ["Iran", "IRST"] },

  // Europe
  "Europe/London": {
    country: "United Kingdom",
    aliases: ["UK", "Britain", "England", "Scotland", "Wales", "GMT", "BST", "Edinburgh", "Manchester", "Glasgow"],
  },
  "Europe/Paris": { country: "France", aliases: ["France", "CET", "CEST"] },
  "Europe/Berlin": { country: "Germany", aliases: ["Germany", "Munich", "Frankfurt", "Hamburg", "Cologne", "CET"] },
  "Europe/Madrid": { country: "Spain", aliases: ["Spain", "Barcelona", "Seville"] },
  "Europe/Rome": { country: "Italy", aliases: ["Italy", "Milan", "Naples", "Florence"] },
  "Europe/Amsterdam": { country: "Netherlands", aliases: ["Netherlands", "Holland", "Rotterdam"] },
  "Europe/Brussels": { country: "Belgium" },
  "Europe/Vienna": { country: "Austria" },
  "Europe/Zurich": { country: "Switzerland", aliases: ["Switzerland", "Geneva", "Bern"] },
  "Europe/Stockholm": { country: "Sweden" },
  "Europe/Oslo": { country: "Norway" },
  "Europe/Copenhagen": { country: "Denmark" },
  "Europe/Helsinki": { country: "Finland" },
  "Europe/Warsaw": { country: "Poland" },
  "Europe/Prague": { country: "Czechia", aliases: ["Czech Republic"] },
  "Europe/Athens": { country: "Greece" },
  "Europe/Istanbul": { country: "Turkey", aliases: ["Turkey", "Ankara"] },
  "Europe/Moscow": { country: "Russia", aliases: ["Russia", "St Petersburg", "MSK"] },
  "Europe/Lisbon": { country: "Portugal", aliases: ["Portugal", "Porto"] },
  "Europe/Dublin": { country: "Ireland" },

  // Americas — North
  "America/New_York": {
    country: "USA (Eastern)",
    aliases: ["USA", "United States", "NYC", "New York City", "Manhattan", "Brooklyn", "Boston", "Miami", "Atlanta", "Washington DC", "Philadelphia", "EST", "EDT", "Eastern"],
  },
  "America/Chicago": { country: "USA (Central)", aliases: ["USA", "Dallas", "Houston", "Austin", "Minneapolis", "Nashville", "CST", "CDT", "Central"] },
  "America/Denver": { country: "USA (Mountain)", aliases: ["USA", "Salt Lake City", "Albuquerque", "MST", "MDT", "Mountain"] },
  "America/Phoenix": { country: "USA (Arizona)", aliases: ["USA", "Tucson"] },
  "America/Los_Angeles": {
    country: "USA (Pacific)",
    aliases: ["USA", "LA", "San Francisco", "SF", "Seattle", "Portland", "San Diego", "San Jose", "Silicon Valley", "Bay Area", "Las Vegas", "PST", "PDT", "Pacific"],
  },
  "America/Anchorage": { country: "USA (Alaska)", aliases: ["USA", "Alaska", "AKST"] },
  "Pacific/Honolulu": { country: "USA (Hawaii)", aliases: ["USA", "Hawaii", "Honolulu", "HST"] },
  "America/Toronto": { country: "Canada (Eastern)", aliases: ["Canada", "Ottawa", "Montreal"] },
  "America/Vancouver": { country: "Canada (Pacific)", aliases: ["Canada"] },
  "America/Mexico_City": { country: "Mexico", aliases: ["Mexico", "CDMX", "Guadalajara", "Monterrey"] },

  // Americas — South
  "America/Sao_Paulo": { country: "Brazil", aliases: ["Brazil", "Rio de Janeiro", "Rio", "Brasília", "Brasilia", "BRT"] },
  "America/Santiago": { country: "Chile", aliases: ["Chile"] },
  "America/Lima": { country: "Peru", aliases: ["Peru"] },
  "America/Bogota": { country: "Colombia", aliases: ["Colombia", "Medellin"] },
  "America/Caracas": { country: "Venezuela", aliases: ["Venezuela"] },

  // Oceania
  "Australia/Sydney": { country: "Australia (AEST)", aliases: ["Australia", "Canberra", "AEST", "AEDT"] },
  "Australia/Melbourne": { country: "Australia (Victoria)", aliases: ["Australia"] },
  "Australia/Brisbane": { country: "Australia (Queensland)", aliases: ["Australia", "Gold Coast"] },
  "Australia/Perth": { country: "Australia (Western)", aliases: ["Australia", "AWST"] },
  "Australia/Adelaide": { country: "Australia (South)", aliases: ["Australia", "ACST"] },
  "Pacific/Auckland": { country: "New Zealand", aliases: ["NZ", "New Zealand", "Wellington", "Christchurch", "NZST", "NZDT"] },
  "Pacific/Fiji": { country: "Fiji" },

  // Africa
  "Africa/Cairo": { country: "Egypt", aliases: ["Egypt"] },
  "Africa/Johannesburg": { country: "South Africa", aliases: ["South Africa", "Cape Town", "Pretoria", "SAST"] },
  "Africa/Lagos": { country: "Nigeria", aliases: ["Nigeria", "Abuja"] },
  "Africa/Nairobi": { country: "Kenya", aliases: ["Kenya", "EAT"] },
  "Africa/Casablanca": { country: "Morocco", aliases: ["Morocco"] },

  // UTC
  UTC: { country: "Coordinated Universal Time", aliases: ["GMT", "Zulu", "Z"] },
};
