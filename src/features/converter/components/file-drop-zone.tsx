import { FileUpIcon } from "lucide-react";
import type { DragEvent } from "react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

type FileDropZoneProps = {
  readonly onFiles: (files: readonly File[]) => void;
  readonly compact?: boolean;
};

const hasFiles = (event: DragEvent): boolean => event.dataTransfer.types.includes("Files");

export const FileDropZone = ({ onFiles, compact = false }: FileDropZoneProps) => {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <>
      <button
        type="button"
        className={cn(
          "group relative flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card text-center transition-colors outline-none",
          "hover:border-primary/40 hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          dragging && "border-primary bg-accent/60",
          compact ? "px-4 py-6" : "px-6 py-14 sm:py-20",
        )}
        onClick={() => {
          input.current?.click();
        }}
        onDragEnter={(event) => {
          if (hasFiles(event)) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragOver={(event) => {
          if (hasFiles(event)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }
        }}
        onDragLeave={(event) => {
          const related = event.relatedTarget;
          if (!(related instanceof Node && event.currentTarget.contains(related))) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onFiles([...event.dataTransfer.files]);
        }}
      >
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-primary/5 text-primary ring-8 ring-primary/[0.03] transition-transform group-hover:scale-105",
            compact ? "size-10" : "size-14",
          )}
        >
          <FileUpIcon className={compact ? "size-5" : "size-6"} />
        </span>
        <span className="flex flex-col gap-1">
          <span className={cn("font-medium", compact ? "text-sm" : "text-base")}>
            {dragging ? "Drop to add" : "Drop EPUB files here"}
          </span>
          <span className="text-sm text-muted-foreground">
            or{" "}
            <span className="font-medium text-foreground underline underline-offset-4">browse</span>{" "}
            — add as many as you like
          </span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".epub,application/epub+zip"
        multiple
        hidden
        onChange={(event) => {
          onFiles([...(event.currentTarget.files ?? [])]);
          event.currentTarget.value = "";
        }}
      />
    </>
  );
};
