// Fixed-size silent video. Holds a grey box at the given size, with a spinner
// centered in it, until the first frame is ready. Then the video fades in,
// autoplays, and loops.

class ProgressiveVideo extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;

    const width = Number.parseInt(this.getAttribute("width"), 10);
    const height = Number.parseInt(this.getAttribute("height"), 10);

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

      video {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0;
        transition: opacity 240ms ease;
      }

      video.is-loaded {
        opacity: 1;
      }

      .spinner {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        color: var(--color-muted);
        pointer-events: none;
        transition: opacity 240ms ease;
      }

      :host(.is-loaded) .spinner,
      :host(.is-error) .spinner {
        opacity: 0;
      }

      .spinner svg {
        display: block;
        width: 19px;
        height: 19px;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        video,
        .spinner {
          transition: none;
        }

        .spinner svg {
          animation: none;
        }
      }
    `;

    const spinner = document.createElement("div");
    spinner.className = "spinner";
    spinner.innerHTML = `
      <svg viewBox="0 0 19 19" fill="none" aria-hidden="true">
        <path d="M9.5 3.16667A6.33333 6.33333 0 1 1 4.2 5.55" stroke="#000000" stroke-width="1.1875" stroke-linecap="square"/>
      </svg>
    `;

    const video = document.createElement("video");
    video.width = width;
    video.height = height;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";

    const markLoaded = () => {
      video.classList.add("is-loaded");
      this.classList.add("is-loaded");
      video.play().catch(() => {});
    };

    video.addEventListener("loadeddata", markLoaded, { once: true });
    video.addEventListener(
      "error",
      () => {
        this.classList.add("is-error");
      },
      { once: true },
    );

    video.src = this.getAttribute("src");
    shadow.append(style, video, spinner);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) markLoaded();
  }
}

customElements.define("progressive-video", ProgressiveVideo);
