import { Crepe, CrepeFeature } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/prosemirror.css";
import "@milkdown/crepe/theme/common/reset.css";
import "@milkdown/crepe/theme/common/block-edit.css";
import "@milkdown/crepe/theme/common/code-mirror.css";
import "@milkdown/crepe/theme/common/cursor.css";
import "@milkdown/crepe/theme/common/link-tooltip.css";
import "@milkdown/crepe/theme/common/list-item.css";
import "@milkdown/crepe/theme/common/placeholder.css";
import "@milkdown/crepe/theme/common/toolbar.css";
import "@milkdown/crepe/theme/common/table.css";
import "@milkdown/crepe/theme/common/top-bar.css";
import "@milkdown/crepe/theme/frame.css";
import { useEffect, useRef, useState } from "react";

interface MilkdownMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function MilkdownMarkdownEditor({
  value,
  onChange,
}: MilkdownMarkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let isMounted = true;
    root.innerHTML = "";
    setError(null);

    const crepe = new Crepe({
      root,
      defaultValue: value,
      features: {
        [CrepeFeature.ImageBlock]: false,
        [CrepeFeature.Latex]: false,
        [CrepeFeature.TopBar]: true,
      },
      featureConfigs: {
        [CrepeFeature.Placeholder]: {
          text: "Start writing...",
        },
      },
    });

    crepe.on((api) => {
      api.markdownUpdated((_ctx, markdown) => {
        onChangeRef.current(markdown);
      });
    });

    void crepe.create().catch((err: unknown) => {
      if (!isMounted) return;
      setError(err instanceof Error ? err.message : "Failed to load Milkdown");
    });

    return () => {
      isMounted = false;
      void crepe.destroy().catch(() => undefined);
      root.innerHTML = "";
    };
    // This editor intentionally remounts from `value` via React `key` in the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="milkdown-editor min-h-0 flex-1 overflow-y-auto bg-white dark:bg-neutral-800">
      {error ? (
        <div className="px-6 py-5 text-sm text-red-500 dark:text-red-400">
          {error}
        </div>
      ) : null}
      <div ref={rootRef} className="min-h-full" />
    </div>
  );
}
