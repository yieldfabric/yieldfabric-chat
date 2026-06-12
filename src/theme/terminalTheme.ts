import type { TerminalTheme } from '@yieldfabric/terminal';

/**
 * Light terminal theme, keyed to this example's brand palette (see
 * tailwind.config.js). The terminal ships a DARK default theme — on a
 * light page you must pass overrides via the `theme` prop or response
 * text renders near-invisible. This mirrors how the first-party app
 * themes its light mode (`yieldfabric-app/src/theme/terminalLightTheme.ts`);
 * every key is optional and merges over the default.
 */
export const lightTerminalTheme: Partial<TerminalTheme> = {
  // Accent — the example's indigo brand.
  primary: '#2f4496',
  primaryMuted: 'rgba(47,68,150,0.10)',
  primaryHover: 'rgba(47,68,150,0.22)',

  // Surfaces
  bgBase: '#ffffff',
  bgRaised: '#ffffff',
  bgRaisedAlt: '#eef1f6',
  bgRaisedHover: '#f7f8fa',
  bgOverlay: 'rgba(247,248,250,0.94)',
  bgHeader: '#f7f8fa',
  bgInput: '#f7f8fa',

  // Borders
  border: '#c7d0dc',
  borderLight: '#e3e8f0',
  borderStrong: '#aab6c5',

  // Text
  text: '#0e1726',
  textSecondary: '#32373c',
  textMuted: '#5f6b7a',
  textInverse: '#ffffff',
  textSystem: '#32373c',
  textCommand: '#2f4496',
  textResponse: '#0e1726',

  // Status — matches the semantic status tokens in tailwind.config.js.
  success: '#1a6b42',
  error: '#9b2c3c',
  warning: '#7a6518',
  info: '#1a5090',

  // Code / markdown
  codeBg: '#eef1f6',
  codeText: '#27387b',
  headingText: '#27387b',

  // Buttons
  buttonBg: '#eef1f6',
  buttonHover: '#e3e8f0',
  buttonUploadBg: '#dcf0e6',
  buttonFilesBg: '#dceaf8',
  buttonShadow: '0 1px 2px rgba(14,23,38,0.06)',

  // Scoped badges / collaboration
  scopeBorder: 'rgba(47,68,150,0.22)',
  scopeBg: 'rgba(47,68,150,0.06)',
  collabBorder: 'rgba(16,185,129,0.22)',
  collabBg: 'rgba(16,185,129,0.06)',

  // Reasoning / pipeline cards
  reasoningBorder: '#e3e8f0',
  reasoningBg: '#ffffff',
  reasoningAccent: 'rgba(47,68,150,0.12)',
  pipelineBg: '#e8f8f0',

  // Shadows
  shadowModal: '0 25px 50px -12px rgba(14,23,38,0.16), 0 0 0 1px rgba(14,23,38,0.05)',
  shadowDropdown: '0 10px 25px -5px rgba(14,23,38,0.10), 0 0 0 1px rgba(14,23,38,0.04)',

  cursor: '#2f4496',
};
