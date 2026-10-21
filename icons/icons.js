const ICONS = {
  "icon-arrow": `
    <path d="M11.0833 5.552L16.0312 10.4999L11.0833 15.4478" stroke="currentColor" stroke-width="1.1875" stroke-linecap="square"/>
    <path d="M15.4375 10.5H2.96875" stroke="currentColor" stroke-width="1.1875" stroke-linecap="square"/>
  `,
  "icon-external": `
    <path d="M14.4479 12.0729V4.55208H6.92708" stroke="currentColor" stroke-width="1.1875" stroke-linecap="square"/>
    <path d="M4.75 14.2499L13.9335 5.0664" stroke="currentColor" stroke-width="1.1875" stroke-linecap="square"/>
  `,
  "icon-play": `
    <path d="M3.76042 15.2396V3.76042L15.2396 9.5L3.76042 15.2396Z" stroke="currentColor" stroke-width="1.1875"/>
  `,
  "icon-pause": `
    <path d="M6.53125 3.76042V15.2396" stroke="currentColor" stroke-width="1.1875" stroke-linecap="square"/>
    <path d="M12.46875 3.76042V15.2396" stroke="currentColor" stroke-width="1.1875" stroke-linecap="square"/>
  `,
  "icon-spinner": `
    <path d="M9.5 3.16667A6.33333 6.33333 0 1 1 4.2 5.55" stroke="currentColor" stroke-width="1.1875" stroke-linecap="square"/>
  `,
};

for (const [name, paths] of Object.entries(ICONS)) {
  customElements.define(
    name,
    class extends HTMLElement {
      connectedCallback() {
        if (this.querySelector("svg")) return;
        this.innerHTML = `<svg viewBox="0 0 19 19" fill="none" aria-hidden="true">${paths}</svg>`;
      }
    },
  );
}
