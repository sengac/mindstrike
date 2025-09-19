export interface FontScheme {
  name: string;
  displayName: string;
  description: string;
  imports: string[];
  css: {
    fontFamily: string;
    headingFontFamily: string;
    codeFontFamily: string;
  };
}

export const fontSchemes: Record<string, FontScheme> = {
  system: {
    name: 'system',
    displayName: 'System Default',
    description: 'Use system default fonts',
    imports: [],
    css: {
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      headingFontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      codeFontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    },
  },
  inter: {
    name: 'inter',
    displayName: 'Inter',
    description: 'Clean and modern - perfect for interfaces',
    imports: [
      '@fontsource/inter/400.css',
      '@fontsource/inter/500.css',
      '@fontsource/inter/600.css',
      '@fontsource/fira-code/400.css',
    ],
    css: {
      fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
      headingFontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
      codeFontFamily: '"Fira Code", ui-monospace, SFMono-Regular, monospace',
    },
  },
  serif: {
    name: 'serif',
    displayName: 'Serif Classic',
    description: 'Traditional and elegant for reading',
    imports: [
      '@fontsource/source-serif-pro/400.css',
      '@fontsource/source-serif-pro/600.css',
      '@fontsource/source-code-pro/400.css',
    ],
    css: {
      fontFamily:
        '"Source Serif Pro", ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
      headingFontFamily:
        '"Source Serif Pro", ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
      codeFontFamily:
        '"Source Code Pro", ui-monospace, SFMono-Regular, monospace',
    },
  },
  monospace: {
    name: 'monospace',
    displayName: 'Monospace',
    description: 'Developer-friendly monospace throughout',
    imports: [
      '@fontsource/source-code-pro/400.css',
      '@fontsource/source-code-pro/600.css',
    ],
    css: {
      fontFamily: '"Source Code Pro", ui-monospace, SFMono-Regular, monospace',
      headingFontFamily:
        '"Source Code Pro", ui-monospace, SFMono-Regular, monospace',
      codeFontFamily:
        '"Source Code Pro", ui-monospace, SFMono-Regular, monospace',
    },
  },
  academic: {
    name: 'academic',
    displayName: 'Academic',
    description: 'Scholarly and professional appearance',
    imports: [
      '@fontsource/crimson-pro/400.css',
      '@fontsource/crimson-pro/600.css',
      '@fontsource/source-code-pro/400.css',
    ],
    css: {
      fontFamily:
        '"Crimson Pro", ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
      headingFontFamily:
        '"Crimson Pro", ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
      codeFontFamily:
        '"Source Code Pro", ui-monospace, SFMono-Regular, monospace',
    },
  },
};

export const getFontScheme = (name: string): FontScheme => {
  return fontSchemes[name] || fontSchemes.system;
};

export const loadFontScheme = (name: string): void => {
  const scheme = getFontScheme(name);

  // Remove existing font scheme imports
  const existingImports = document.querySelectorAll('link[data-font-scheme]');
  existingImports.forEach(link => link.remove());

  // Add new font imports
  scheme.imports.forEach(importPath => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = importPath;
    link.setAttribute('data-font-scheme', name);
    document.head.appendChild(link);
  });

  // Update CSS custom properties
  const root = document.documentElement;
  root.style.setProperty('--font-family-base', scheme.css.fontFamily);
  root.style.setProperty('--font-family-heading', scheme.css.headingFontFamily);
  root.style.setProperty('--font-family-code', scheme.css.codeFontFamily);
};
