import type { RefObject } from "react";
import type { ChatElementSelection } from "../../store/chatStore";
import { useViewerElementPicker } from "./hooks/useViewerElementPicker";
import { viewerKindLabel, viewerLabelForEntry, viewerLanguageForEntry } from "./lib/viewerMetadata";
import { ViewerBody } from "./viewer/ViewerBody";
import { ViewerHeader } from "./viewer/ViewerHeader";
import type { WorkspaceEntry } from "./types";

export interface ViewerPickerInjection {
  iframeRef: RefObject<HTMLIFrameElement>;
  isSelectingElement: boolean;
  pickerError: string | null;
  canPickElements: boolean;
  toggleSelecting: () => void;
}

interface ViewerPaneProps {
  selectedViewerPath: string | null;
  selectedViewerUrl: string | null;
  selectedEntry?: WorkspaceEntry | null;
  workspaceEntries: WorkspaceEntry[];
  fileViewerText: string | null;
  fileViewerError: string | null;
  isLoadingFileViewer: boolean;
  viewerRefreshKey: number;
  mobile?: boolean;

  onBack?: () => void;
  onRefresh: () => void;
  onSelectElement?: (selection: ChatElementSelection) => void;
  onOpenViewerPath?: (viewerPath: string) => void;
  /** If provided, this pane will share picker state with a sibling composer. */
  pickerInjection?: ViewerPickerInjection;
}

export function ViewerPane({
  selectedViewerPath,
  selectedViewerUrl,
  selectedEntry = null,
  workspaceEntries,
  fileViewerText,
  fileViewerError,
  isLoadingFileViewer,
  viewerRefreshKey,
  mobile = false,

  onBack,
  onRefresh,
  onSelectElement,
  onOpenViewerPath,
  pickerInjection,
}: ViewerPaneProps) {
  const title = viewerLabelForEntry(selectedEntry, selectedViewerPath);
  const kindLabel = viewerKindLabel(selectedEntry);
  const viewerLanguage = viewerLanguageForEntry(selectedEntry);
  const ownCanPickElements =
    selectedEntry?.kind === "app" && Boolean(selectedViewerUrl) && Boolean(onSelectElement);

  const ownPicker = useViewerElementPicker({
    canPickElements: pickerInjection ? false : ownCanPickElements,
    viewerRefreshKey,
    selectedViewerUrl,
    onSelectElement,
  });

  const { iframeRef, isSelectingElement, pickerError } =
    pickerInjection ?? ownPicker;

  return (
    <div
      className={`flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
        mobile
          ? "bg-neutral-50 dark:bg-neutral-900"
          : "border-l border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900"
      }`}
    >
      {selectedEntry?.kind === "app" ? null : (
        <ViewerHeader
          mobile={mobile}
          title={title}
          kindLabel={kindLabel}
          selectedEntry={selectedEntry}
          selectedViewerUrl={selectedViewerUrl}
          onBack={onBack}
          onRefresh={onRefresh}
        />
      )}

      {(mobile || !pickerInjection) && pickerError ? (
        <div className="px-2 pt-2">
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {pickerError}
          </div>
        </div>
      ) : null}

      {(mobile || !pickerInjection) && isSelectingElement ? (
        <div className="px-2 pt-2">
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
            Tap any element in the viewer to attach it to chat.
          </div>
        </div>
      ) : null}

      <div
        className={`min-h-0 min-w-0 flex-1 ${
          mobile ? "overflow-hidden" : "overflow-y-auto"
        } ${selectedEntry?.kind === "app" ? "" : "p-2"}`}
      >
        <ViewerBody
          selectedEntry={selectedEntry}
          selectedViewerUrl={selectedViewerUrl}
          workspaceEntries={workspaceEntries}
          fileViewerText={fileViewerText}
          fileViewerError={fileViewerError}
          isLoadingFileViewer={isLoadingFileViewer}
          viewerRefreshKey={viewerRefreshKey}
          viewerLanguage={viewerLanguage}
          kindLabel={kindLabel}
          mobile={mobile}
          iframeRef={iframeRef}
          onOpenViewerPath={onOpenViewerPath}
        />
      </div>
    </div>
  );
}
