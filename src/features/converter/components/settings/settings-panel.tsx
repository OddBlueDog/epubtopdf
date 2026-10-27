import { RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import type { ConversionSettings } from "@/core/settings";
import {
  DEFAULT_SETTINGS,
  FONT_FAMILIES,
  FONT_SIZE_RANGE,
  IMAGE_QUALITIES,
  LAYOUT_MODES,
  LINE_HEIGHT_RANGE,
  MARGIN_RANGE,
  PAGE_SIZES,
  settingsKey,
  TEXT_ALIGNMENTS,
} from "@/core/settings";
import { PagePreview } from "@/features/converter/components/settings/page-preview";
import {
  optionsFrom,
  SegmentedSetting,
  SelectSetting,
  SliderSetting,
  SwitchSetting,
} from "@/features/converter/components/settings/setting-controls";

const LAYOUT_OPTIONS = optionsFrom(LAYOUT_MODES);
const PAGE_SIZE_OPTIONS = optionsFrom(PAGE_SIZES);
const FONT_OPTIONS = optionsFrom(FONT_FAMILIES);
const ALIGN_OPTIONS = optionsFrom(TEXT_ALIGNMENTS);
const IMAGE_OPTIONS = optionsFrom(IMAGE_QUALITIES);

type SettingsPanelProps = {
  readonly settings: ConversionSettings;
  readonly onChange: (update: (previous: ConversionSettings) => ConversionSettings) => void;
};

export const SettingsPanel = ({ settings, onChange }: SettingsPanelProps) => {
  const set =
    <K extends keyof ConversionSettings>(key: K) =>
    (value: ConversionSettings[K]): void => {
      onChange((previous) => ({ ...previous, [key]: value }));
    };
  const isDefault = settingsKey(settings) === settingsKey(DEFAULT_SETTINGS);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Output settings</CardTitle>
        <CardDescription>Applied to new conversions.</CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            disabled={isDefault}
            onClick={() => {
              onChange(() => DEFAULT_SETTINGS);
            }}
          >
            <RotateCcwIcon />
            Reset
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <SegmentedSetting
            label="Layout"
            value={settings.layout}
            options={LAYOUT_OPTIONS}
            description={LAYOUT_MODES[settings.layout].description}
            onChange={set("layout")}
          />

          <PagePreview settings={settings} />

          <FieldSet>
            <FieldLegend>Page</FieldLegend>
            <FieldGroup>
              <SelectSetting
                label="Page size"
                value={settings.pageSize}
                options={PAGE_SIZE_OPTIONS}
                onChange={set("pageSize")}
              />
              <SliderSetting
                label="Margins"
                value={settings.marginMm}
                range={MARGIN_RANGE}
                format={(mm) => `${mm} mm`}
                onChange={set("marginMm")}
              />
            </FieldGroup>
          </FieldSet>

          <FieldSeparator />

          <FieldSet>
            <FieldLegend>Typography</FieldLegend>
            <FieldDescription>
              {settings.layout === "publisher"
                ? "Defaults for text the book doesn't style itself."
                : "Applied to all text, replacing the book's styling."}
            </FieldDescription>
            <FieldGroup>
              <SegmentedSetting
                label="Typeface"
                value={settings.fontFamily}
                options={FONT_OPTIONS}
                description={FONT_FAMILIES[settings.fontFamily].description}
                onChange={set("fontFamily")}
              />
              <SliderSetting
                label="Text size"
                value={settings.fontSizePt}
                range={FONT_SIZE_RANGE}
                format={(pt) => `${pt} pt`}
                onChange={set("fontSizePt")}
              />
              <SliderSetting
                label="Line spacing"
                value={settings.lineHeight}
                range={LINE_HEIGHT_RANGE}
                format={(ratio) => `${ratio.toFixed(2)}×`}
                onChange={set("lineHeight")}
              />
              <SegmentedSetting
                label="Alignment"
                value={settings.textAlign}
                options={ALIGN_OPTIONS}
                onChange={set("textAlign")}
              />
            </FieldGroup>
          </FieldSet>

          <FieldSeparator />

          <FieldSet>
            <FieldLegend>Content</FieldLegend>
            <FieldGroup>
              <SwitchSetting
                label="Images"
                description="Include illustrations and figures."
                checked={settings.includeImages}
                onChange={set("includeImages")}
              />
              <SelectSetting
                label="Image quality"
                value={settings.imageQuality}
                options={IMAGE_OPTIONS}
                disabled={!settings.includeImages && !settings.includeCover}
                onChange={set("imageQuality")}
              />
              <SwitchSetting
                label="Cover page"
                description="Full-bleed cover as the first page."
                checked={settings.includeCover}
                onChange={set("includeCover")}
              />
              <SwitchSetting
                label="Table of contents"
                description="Linked contents page with page numbers."
                checked={settings.includeToc}
                onChange={set("includeToc")}
              />
              <SwitchSetting
                label="Page numbers"
                checked={settings.pageNumbers}
                onChange={set("pageNumbers")}
              />
              <SwitchSetting
                label="Chapters on new page"
                checked={settings.chapterPageBreaks}
                onChange={set("chapterPageBreaks")}
              />
            </FieldGroup>
          </FieldSet>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};
