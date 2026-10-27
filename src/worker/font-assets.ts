import interRegular from "@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf?url";
import interItalic from "@expo-google-fonts/inter/400Regular_Italic/Inter_400Regular_Italic.ttf?url";
import interBold from "@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf?url";
import interBoldItalic from "@expo-google-fonts/inter/700Bold_Italic/Inter_700Bold_Italic.ttf?url";
import monoRegular from "@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf?url";
import monoItalic from "@expo-google-fonts/jetbrains-mono/400Regular_Italic/JetBrainsMono_400Regular_Italic.ttf?url";
import monoBold from "@expo-google-fonts/jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf?url";
import monoBoldItalic from "@expo-google-fonts/jetbrains-mono/700Bold_Italic/JetBrainsMono_700Bold_Italic.ttf?url";
import literataRegular from "@expo-google-fonts/literata/400Regular/Literata_400Regular.ttf?url";
import literataItalic from "@expo-google-fonts/literata/400Regular_Italic/Literata_400Regular_Italic.ttf?url";
import literataBold from "@expo-google-fonts/literata/700Bold/Literata_700Bold.ttf?url";
import literataBoldItalic from "@expo-google-fonts/literata/700Bold_Italic/Literata_700Bold_Italic.ttf?url";

import type { FontLoader, FontRole, FontVariant } from "@/core/pdf/fonts";

/**
 * Font files bundled by Vite as hashed, same-origin assets and fetched on demand.
 * Only the families a document actually uses are downloaded.
 */
const FONT_URLS: Readonly<Record<FontRole, Readonly<Record<FontVariant, string>>>> = {
  serif: {
    normal: literataRegular,
    bold: literataBold,
    italics: literataItalic,
    bolditalics: literataBoldItalic,
  },
  sans: {
    normal: interRegular,
    bold: interBold,
    italics: interItalic,
    bolditalics: interBoldItalic,
  },
  mono: {
    normal: monoRegular,
    bold: monoBold,
    italics: monoItalic,
    bolditalics: monoBoldItalic,
  },
};

export const fetchFont: FontLoader = async (role, variant) => {
  const url = new URL(FONT_URLS[role][variant], self.location.href);
  if (url.origin !== self.location.origin) {
    throw new Error(`Refusing to load font from foreign origin: ${url.origin}`);
  }
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`Failed to load font ${url.pathname} (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
};
