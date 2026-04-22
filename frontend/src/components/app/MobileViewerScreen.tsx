import type { ChatElementSelection } from "../../store/chatStore";
import { ViewerPane } from "../workspace/ViewerPane";
import type { ViewerPickerInjection } from "../workspace/ViewerPane";
import type { WorkspaceEntry } from "../workspace/types";

interface MobileViewerScreenProps {
  selectedViewerPath: string | null;
  selectedViewerUrl: string | null;
  selectedEntry: WorkspaceEntry | null;
  workspaceEntries: WorkspaceEntry[];
  fileViewerText: string | null;
  fileViewerError: string | null;
  isLoadingFileViewer: boolean;
  viewerRefreshKey: number;
  onBack: () => void;
  onSelectElement: (selection: ChatElementSelection) => void;
  onOpenViewerPath: (viewerPath: string) => void;
  onRefresh: () => void;
  pickerInjection?: ViewerPickerInjection;
}

export function MobileViewerScreen({
  selectedViewerPath,
  selectedViewerUrl,
  selectedEntry,
  workspaceEntries,
  fileViewerText,
  fileViewerError,
  isLoadingFileViewer,
  viewerRefreshKey,
  onBack,
  onSelectElement,
  onOpenViewerPath,
  onRefresh,
  pickerInjection,
}: MobileViewerScreenProps) {
  return (
    <div className="min-h-0 flex-1 md:hidden">
      <ViewerPane
        mobile
        selectedViewerPath={selectedViewerPath}
        selectedViewerUrl={selectedViewerUrl}
        selectedEntry={selectedEntry}
        workspaceEntries={workspaceEntries}
        fileViewerText={fileViewerText}
        fileViewerError={fileViewerError}
        isLoadingFileViewer={isLoadingFileViewer}
        viewerRefreshKey={viewerRefreshKey}
        onBack={onBack}
        onSelectElement={onSelectElement}
        onOpenViewerPath={onOpenViewerPath}
        onRefresh={onRefresh}
        pickerInjection={pickerInjection}
      />
    </div>
  );
}
