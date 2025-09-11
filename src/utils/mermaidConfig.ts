import mermaid from 'mermaid';

// Shared Mermaid configuration to ensure consistent theming
export const MERMAID_CONFIG = {
  startOnLoad: true,
  theme: 'base', // Use base theme for full customization
  securityLevel: 'loose',
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true
  },
  // Additional config for proper scaling in fullscreen
  svg: {
    width: '100%',
    height: '100%'
  },
  themeVariables: {
    darkMode: true,
    background: 'transparent',
    
    // Primary colors matching app palette
    primaryColor: '#374151',
    primaryTextColor: '#e5e7eb',
    primaryBorderColor: '#4b5563',
    
    // Secondary colors
    secondaryColor: '#1f2937',
    secondaryTextColor: '#e5e7eb',
    secondaryBorderColor: '#374151',
    
    // Tertiary colors
    tertiaryColor: '#111827',
    tertiaryTextColor: '#e5e7eb',
    tertiaryBorderColor: '#374151',
    
    // Line and text colors
    lineColor: '#6b7280',
    textColor: '#e5e7eb',
    
    // Background colors
    mainBkg: '#374151',
    secondBkg: '#1f2937',
    tertiaryBkg: '#111827',
    
    // Node styling
    nodeBkg: '#374151',
    nodeTextColor: '#e5e7eb',
    nodeBorder: '#4b5563',
    
    // Cluster styling
    clusterBkg: '#1f2937',
    clusterTextColor: '#e5e7eb',
    clusterBorder: '#374151',
    
    // Fill types (prevent random colors)
    fillType0: '#374151',
    fillType1: '#1f2937', 
    fillType2: '#111827',
    fillType3: '#4b5563',
    fillType4: '#6b7280',
    fillType5: '#9ca3af',
    fillType6: '#d1d5db',
    fillType7: '#e5e7eb',
    
    // Additional flowchart variables
    defaultLinkColor: '#6b7280',
    titleColor: '#e5e7eb',
    edgeLabelBackground: '#1f2937',
    
    // Sequence diagram colors
    actorBkg: '#374151',
    actorBorder: '#4b5563',
    actorTextColor: '#e5e7eb',
    actorLineColor: '#6b7280',
    signalColor: '#e5e7eb',
    signalTextColor: '#e5e7eb',
    labelBoxBkgColor: '#374151',
    labelBoxBorderColor: '#4b5563',
    labelTextColor: '#e5e7eb',
    loopTextColor: '#e5e7eb',
    activationBorderColor: '#4b5563',
    activationBkgColor: '#1f2937',
    sequenceNumberColor: '#e5e7eb',
    
    // Note colors
    noteBkgColor: '#1f2937',
    noteTextColor: '#e5e7eb',
    noteBorderColor: '#374151',
    
    // State diagram colors
    labelColor: '#e5e7eb',
    altBackground: '#1f2937',
    
    // Class diagram colors
    classText: '#e5e7eb'
  }
};


