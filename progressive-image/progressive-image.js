// Fixed-size image that fades in over a grey box.
// src is a folder of AVIF files named {width}.avif, {width*2}.avif, and {width*3}.avif.

class ProgressiveImage extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;

    const width = Number.parseInt(this.getAttribute("width"), 10);
    const height = Number.parseInt(this.getAttribute("height"), 10);
    const folder = this.getAttribute("src").replace(/\/$/, "");

    const shadow = this.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: block;
        position: relative;
        flex-shrink: 0;
        overflow: hidden;
        background: #c8c8c8;
        width: ${width}px;
        max-width: 100%;
        height: auto;
        aspect-ratio: ${width} / ${height};
      }

      img {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0;
        transition: opacity 240ms ease;
      }

      img.is-loaded {
        opacity: 1;
      }

      @media (prefers-reduced-motion: reduce) {
        img {
          transition: none;
        }
      }
    `;

    const candidates = [1, 2, 3].map((scale) => {
      const pixels = width * scale;
      return `${folder}/${pixels}.avif ${pixels}w`;
    });

    const img = document.createElement("img");
    img.alt = this.getAttribute("alt") ?? "";
    img.width = width;
    img.height = height;
    img.sizes = `(max-width: ${width}px) 100vw, ${width}px`;
    img.decoding = "async";
    img.loading = this.getAttribute("loading") ?? "lazy";

    const markLoaded = () => img.classList.add("is-loaded");
    img.addEventListener("load", markLoaded, { once: true });
    img.src = `${folder}/${width}.avif`;
    img.srcset = candidates.join(", ");
    if (img.complete && img.naturalWidth > 0) markLoaded();

    shadow.append(style, img);
  }
}

customElements.define("progressive-image", ProgressiveImage);
