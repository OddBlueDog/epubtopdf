import { BookTextIcon, ShieldCheckIcon } from "lucide-react";

import { ThemeToggle } from "@/app/theme-toggle";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConverterPage } from "@/features/converter/components/converter-page";

export const App = () => (
  <TooltipProvider delayDuration={300}>
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookTextIcon className="size-4" />
          </div>
          <span className="font-heading font-semibold tracking-tight">EPUB to PDF</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <div className="max-w-2xl space-y-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Turn e-books into beautiful PDFs
          </h1>
          <p className="text-pretty text-muted-foreground">
            Drop in one or many EPUB files, tune the layout, and download print-ready PDFs with a
            linked table of contents and bookmarks.
          </p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
            Everything runs in your browser — your books are never uploaded.
          </p>
        </div>
        <ConverterPage />
      </main>
    </div>
  </TooltipProvider>
);
