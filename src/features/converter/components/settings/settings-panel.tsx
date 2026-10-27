import { ChevronDownIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import type { ConversionSettings } from "@/core/settings";
import {
  CSS_MEDIUM_PT,
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
  usesCustomMargins,
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
  const publisher = settings.layout === "publisher";

  const marginSlider = (
    <SliderSetting
      label="Margins"
      value={settings.marginMm}
      range={MARGIN_RANGE}
      format={(mm) => `${mm} mm`}
      onChange={set("marginMm")}
    />
  );
  const typeface = (
    <SegmentedSetting
      label="Typeface"
      value={settings.fontFamily}
      options={FONT_OPTIONS}
      description={FONT_FAMILIES[settings.fontFamily].description}
      onChange={set("fontFamily")}
    />
  );
  const lineSpacing = (
    <SliderSetting
      label="Line spacing"
      value={settings.lineHeight}
      range={LINE_HEIGHT_RANGE}
      format={(ratio) => `${ratio.toFixed(2)}×`}
      onChange={set("lineHeight")}
    />
  );
  const alignment = (
    <SegmentedSetting
      label="Alignment"
      value={settings.textAlign}
      options={ALIGN_OPTIONS}
      onChange={set("textAlign")}
    />
  );

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
              {publisher ? (
                <SwitchSetting
                  label="Custom margins"
                  description={
                    settings.overrideMargins
                      ? "Replaces the book's page margins."
                      : `Uses the book's own page margins (${settings.marginMm} mm if it sets none).`
                  }
                  checked={settings.overrideMargins}
                  onChange={set("overrideMargins")}
                />
              ) : null}
              {usesCustomMargins(settings) ? marginSlider : null}
            </FieldGroup>
          </FieldSet>

          <FieldSeparator />

          <FieldSet>
            <FieldLegend>Typography</FieldLegend>
            <FieldDescription>
              {publisher
                ? "Fonts, sizes and spacing come from the book."
                : "Applied to all text, replacing the book's styling."}
            </FieldDescription>
            {publisher ? (
              <FieldGroup>
                <SwitchSetting
                  label="Adjust text size"
                  description={
                    settings.overrideTextSize
                      ? "Scales all of the book's text proportionally."
                      : "Uses the book's own text sizes (100%)."
                  }
                  checked={settings.overrideTextSize}
                  onChange={set("overrideTextSize")}
                />
                {settings.overrideTextSize ? (
                  <SliderSetting
                    label="Text scale"
                    value={settings.fontSizePt}
                    range={FONT_SIZE_RANGE}
                    format={(pt) => `${Math.round((pt / CSS_MEDIUM_PT) * 100)}%`}
                    onChange={set("fontSizePt")}
                  />
                ) : null}
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-mx-2 w-[calc(100%+1rem)] justify-between text-muted-foreground [&[data-state=open]>svg]:rotate-180"
                    >
                      Fallbacks for unstyled text
                      <ChevronDownIcon className="transition-transform" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <FieldGroup className="pt-3">
                      <FieldDescription>
                        Used only where the book doesn&rsquo;t set these itself.
                      </FieldDescription>
                      {typeface}
                      {lineSpacing}
                      {alignment}
                    </FieldGroup>
                  </CollapsibleContent>
                </Collapsible>
              </FieldGroup>
            ) : (
              <FieldGroup>
                {typeface}
                <SliderSetting
                  label="Text size"
                  value={settings.fontSizePt}
                  range={FONT_SIZE_RANGE}
                  format={(pt) => `${pt} pt`}
                  onChange={set("fontSizePt")}
                />
                {lineSpacing}
                {alignment}
              </FieldGroup>
            )}
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
