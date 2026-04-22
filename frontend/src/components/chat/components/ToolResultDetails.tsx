import type { ChatMessage } from "../../../store/chatStore";
import { getToolResultImages } from "../lib/toolResultHelpers";

interface ToolResultDetailsProps {
  result: ChatMessage;
  onImageClick?: (src: string) => void;
}

export function ToolResultDetails({
  result,
  onImageClick,
}: ToolResultDetailsProps) {
  const images = getToolResultImages(result);
  if (images.length === 0) {
    return null;
  }

  if (result.toolName === "generate_images") {
    return (
      <div className="border-t border-neutral-100 px-3 py-3 dark:border-neutral-700">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
          Generated Images
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {images.map((image, index) => (
            <div
              key={`${result.id}-generated-${index}`}
              className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
            >
              {image.imageUrl ? (
                <img
                  src={image.imageUrl}
                  alt={image.prompt ?? `Generated image ${index + 1}`}
                  className="aspect-square w-full cursor-pointer bg-neutral-100 object-cover transition hover:opacity-80 dark:bg-neutral-800"
                  onClick={() => onImageClick?.(image.imageUrl ?? "")}
                />
              ) : null}
              <div className="space-y-1 p-3 text-xs">
                {image.prompt ? (
                  <p className="text-neutral-700 dark:text-neutral-200">{image.prompt}</p>
                ) : null}
                <p
                  className={
                    image.status === "error"
                      ? "text-red-500"
                      : "text-neutral-500 dark:text-neutral-400"
                  }
                >
                  {image.status === "error"
                    ? image.error ?? "Generation failed"
                    : "Generated successfully"}
                </p>
                {image.imageUrl ? (
                  <a
                    href={image.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-neutral-500 underline decoration-neutral-300 underline-offset-2 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                  >
                    Open image
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (result.toolName === "remove_background") {
    return (
      <div className="border-t border-neutral-100 px-3 py-3 dark:border-neutral-700">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
          Processed Images
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {images.map((image, index) => {
            const finalUrl = image.resultUrl ?? image.imageUrl ?? null;

            return (
              <div
                key={`${result.id}-processed-${index}`}
                className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
              >
                {finalUrl ? (
                  <img
                    src={finalUrl}
                    alt={`Processed image ${index + 1}`}
                    className="aspect-square w-full cursor-pointer bg-[linear-gradient(45deg,#f5f5f5_25%,transparent_25%),linear-gradient(-45deg,#f5f5f5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f5f5f5_75%),linear-gradient(-45deg,transparent_75%,#f5f5f5_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] object-contain transition hover:opacity-80 dark:bg-[linear-gradient(45deg,#262626_25%,transparent_25%),linear-gradient(-45deg,#262626_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#262626_75%),linear-gradient(-45deg,transparent_75%,#262626_75%)]"
                    onClick={() => onImageClick?.(finalUrl)}
                  />
                ) : null}
                <div className="space-y-1 p-3 text-xs">
                  <p
                    className={
                      image.status === "error"
                        ? "text-red-500"
                        : "text-neutral-500 dark:text-neutral-400"
                    }
                  >
                    {image.status === "error"
                      ? image.error ?? "Background removal failed"
                      : "Background removed"}
                  </p>
                  {finalUrl ? (
                    <a
                      href={finalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-neutral-500 underline decoration-neutral-300 underline-offset-2 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                    >
                      Open image
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
