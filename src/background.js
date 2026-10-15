// The entire job of this file: make clicking the toolbar icon open the side panel.
// Chrome requires an extension to say so explicitly.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('[Ophtho Case Log] panel behavior:', err));
