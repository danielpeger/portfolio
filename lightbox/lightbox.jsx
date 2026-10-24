// Lightbox for the hero and the images and videos inside an article.
// Leave one out with data-lightbox="off" on that element.
// A still opens <its src folder>/full.avif. A video opens its own src.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import * as Lightbox from "@ramka/react/lightbox";

const MEDIA =
  ".page > progressive-image, article progressive-image, article progressive-video";

function collectSlides() {
  return [...document.querySelectorAll(MEDIA)]
    .filter((el) => el.getAttribute("data-lightbox") !== "off")
    .map((el) => {
      const video = el.tagName === "PROGRESSIVE-VIDEO";
      const raw = el.getAttribute("src") ?? "";
      const figure = el.closest("figure");
      const caption = figure
        ?.querySelector("figcaption")
        ?.textContent.replace(/\s+/g, " ")
        .trim();
      return {
        el,
        video,
        src: video ? raw : `${raw.replace(/\/$/, "")}/full.avif`,
        alt: el.getAttribute("alt") ?? "",
        width: Number(el.getAttribute("width")),
        height: Number(el.getAttribute("height")),
        caption: caption || undefined,
      };
    })
    .filter((slide) => slide.src && slide.width > 0 && slide.height > 0);
}

// Keep decoded full-size stills alive so the open morph snapshots the sharp
// image instead of an empty frame. Bytes start loading immediately; decode
// runs one image at a time so a page of heroes doesn't decode all at once.
const decodedStills = new Map();

function decodeStill(src) {
  let img = decodedStills.get(src);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = src;
    decodedStills.set(src, img);
  }
  return img.decode?.().catch(() => {});
}

// A video's max-content size is the browser default (300×150) until metadata
// loads, which makes the opening morph shrink and then jump. Capture the
// frame the page is already showing so the lightbox video has a poster
// immediately, and cap the box with the known native width instead.
const videoPosters = new Map();

function capturePoster(item) {
  if (videoPosters.has(item.src)) return;
  const source = item.el.shadowRoot?.querySelector("video");
  if (!source || source.readyState < 2 || !(source.videoWidth > 0)) return;
  const canvas = document.createElement("canvas");
  canvas.width = source.videoWidth;
  canvas.height = source.videoHeight;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  try {
    ctx.drawImage(source, 0, 0);
    videoPosters.set(item.src, canvas.toDataURL("image/jpeg", 0.72));
  } catch {
    // The size cap does not depend on the poster.
  }
}

// Safari replaces the view-transition animation a frame after it starts.
// That gap is a blank frame when the snapshot is a video. Chrome keeps the
// original animation, so only a video close in Safari skips the replacement.
function holdSafariVideoClose() {
  if (!("GestureEvent" in window)) return;
  if (!document.querySelector("[data-ramka-item][data-active] video")) return;
  window.__RAMKA_VT_COMPOSITED__ = false;
}

function releaseSafariVideoClose() {
  delete window.__RAMKA_VT_COMPOSITED__;
}

function preloadVideos(items) {
  for (const item of items) {
    if (!item.video) continue;
    const source = item.el.shadowRoot?.querySelector("video");
    if (!source) continue;
    const grab = () => capturePoster(item);
    if (source.readyState >= 2) grab();
    else source.addEventListener("loadeddata", grab, { once: true });
  }
}

function preloadStills(items) {
  const stills = items.filter((item) => !item.video);
  for (const item of stills) {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = item.src;
    link.fetchPriority = "low";
    document.head.append(link);
  }
  const run = () => {
    let chain = Promise.resolve();
    for (const item of stills) chain = chain.then(() => decodeStill(item.src));
  };
  if ("requestIdleCallback" in window) requestIdleCallback(run);
  else setTimeout(run, 1);
}

function Arrow() {
  return (
    <svg viewBox="0 0 19 19" fill="none" aria-hidden="true">
      <path
        d="M11.0833 5.552L16.0312 10.4999L11.0833 15.4478"
        stroke="currentColor"
        strokeWidth="1.1875"
        strokeLinecap="square"
      />
      <path
        d="M15.4375 10.5H2.96875"
        stroke="currentColor"
        strokeWidth="1.1875"
        strokeLinecap="square"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 19 19" fill="none" aria-hidden="true">
      <path
        d="M4.75 4.75L14.25 14.25"
        stroke="currentColor"
        strokeWidth="1.1875"
        strokeLinecap="square"
      />
      <path
        d="M14.25 4.75L4.75 14.25"
        stroke="currentColor"
        strokeWidth="1.1875"
        strokeLinecap="square"
      />
    </svg>
  );
}

function SlideMedia({ item, active }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [active]);

  const ratio = item.width / item.height;

  return (
    <Lightbox.Media
      width={item.width}
      height={item.height}
      style={{
        width: `min(100cqw, calc(100cqh * ${ratio}))`,
        maxWidth: item.video ? `${item.width}px` : "max-content",
      }}
    >
      {item.video ? (
        <video
          ref={videoRef}
          src={item.src}
          poster={videoPosters.get(item.src) || undefined}
          width={item.width}
          height={item.height}
          muted
          loop
          playsInline
          style={{ objectFit: "cover" }}
        />
      ) : (
        <img src={item.src} alt={item.alt} loading="eager" decoding="async" />
      )}
    </Lightbox.Media>
  );
}

function KeptPicture({ el, imageRef, morphRef }) {
  const holderRef = useCallback(
    (node) => {
      if (node && el.parentNode !== node) node.appendChild(el);
    },
    [el],
  );

  useLayoutEffect(() => {
    morphRef(el);
    const img = el.shadowRoot?.querySelector("img");
    if (img) imageRef(img);
    return () => {
      morphRef(null);
      if (img) imageRef(null);
    };
  }, [el, imageRef, morphRef]);

  return <span ref={holderRef} style={{ display: "contents" }} />;
}

function PictureTrigger({ item, index }) {
  const [slot, setSlot] = useState(null);

  useLayoutEffect(() => {
    const span = document.createElement("span");
    span.style.display = "contents";
    item.el.replaceWith(span);
    setSlot(span);
    return () => {
      if (span.isConnected) span.replaceWith(item.el);
    };
  }, [item.el]);

  if (!slot) return null;

  const warm = () => {
    if (!item.video) decodeStill(item.src);
  };

  return createPortal(
    <Lightbox.Trigger
      index={index}
      aria-label={item.alt || item.caption || (item.video ? "Video" : "Image")}
      onPointerEnter={warm}
      onFocus={warm}
    >
      {({ imageRef, morphRef }) => (
        <KeptPicture el={item.el} imageRef={imageRef} morphRef={morphRef} />
      )}
    </Lightbox.Trigger>,
    slot,
  );
}

function App({ items }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const several = items.length > 1;

  return (
    <Lightbox.Root
      license="gpl"
      loop={several}
      awaitImageDecode={2000}
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(next) => {
        if (!next) releaseSafariVideoClose();
      }}
      onBeforeClose={holdSafariVideoClose}
      value={index}
      onValueChange={setIndex}
    >
      {items.map((item, i) => (
        <PictureTrigger key={item.src} item={item} index={i} />
      ))}
      <Lightbox.Portal>
        <Lightbox.Backdrop className="lb-backdrop" />
        <Lightbox.Content className="lb-content" aria-label="Viewer">
          <Lightbox.Slides
            className="lb-slides"
            aria-label="Article media"
            aria-roledescription="carousel"
            preload={1}
          >
            {items.map((item, i) => (
              <Lightbox.Slide key={item.src} className="lb-slide">
                <Lightbox.Item
                  index={i}
                  caption={item.caption}
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${items.length}`}
                >
                  {({ active }) => (
                    <Lightbox.Zoom>
                      <SlideMedia item={item} active={active && open} />
                    </Lightbox.Zoom>
                  )}
                </Lightbox.Item>
              </Lightbox.Slide>
            ))}
          </Lightbox.Slides>
          {several ? (
            <Lightbox.Previous className="lb-prev" aria-label="Previous">
              <Arrow />
            </Lightbox.Previous>
          ) : null}
          {several ? (
            <Lightbox.Next className="lb-next" aria-label="Next">
              <Arrow />
            </Lightbox.Next>
          ) : null}
          <Lightbox.Close className="lb-close" aria-label="Close">
            <CloseIcon />
          </Lightbox.Close>
          <Lightbox.Caption className="lb-caption" />
        </Lightbox.Content>
      </Lightbox.Portal>
    </Lightbox.Root>
  );
}

const style = document.createElement("style");
style.textContent = `
  [data-ramka-trigger] {
    display: block;
    width: fit-content;
    max-width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: inherit;
    text-align: start;
    cursor: zoom-in;
  }

  .lb-backdrop {
    position: fixed;
    inset: 0;
    background: rgb(255 255 255 / 0.9);
    z-index: 20;

  }

  .lb-content {
    position: fixed;
    inset: 0;
    z-index: 21;
    display: flex;
    color: #000;
    outline: none;
    pointer-events: none;
  }

  .lb-slides,
  .lb-slide {
    pointer-events: none;
  }

  .lb-content [data-ramka-media],
  .lb-prev,
  .lb-next,
  .lb-close {
    pointer-events: auto;
  }

  [data-ramka-zoom]:not([data-zoom]):not([data-dragging]) [data-ramka-media] {
    cursor: auto;
  }

  .lb-slides {
    flex: 1;
    min-height: 0;
    display: flex;
  }

  .lb-slide {
    flex: 0 0 100%;
    min-width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 56px 64px 72px;
  }

  .lb-prev,
  .lb-next,
  .lb-close {
    position: absolute;
    z-index: 2;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    padding: 0;
    border: 0;
    background: #fff;
    color: #000;
    cursor: pointer;
  }

  .lb-close {
    top: 8px;
    right: 8px;
  }

  .lb-prev {
    top: 50%;
    left: 64px;
    transform: translate(-50%, -50%);
  }

  .lb-next {
    top: 50%;
    right: 64px;
    transform: translate(50%, -50%);
  }

  .lb-prev svg {
    transform: scaleX(-1);
  }

  .lb-prev svg,
  .lb-next svg,
  .lb-close svg {
    display: block;
    width: 19px;
    height: 19px;
  }

  .lb-prev:focus-visible,
  .lb-next:focus-visible,
  .lb-close:focus-visible {
    outline: 1px solid #000;
    outline-offset: 2px;
  }

  .lb-caption {
    position: absolute;
    left: 64px;
    right: 64px;
    bottom: 24px;
    margin: 0;
    text-align: center;
    font-family: "General Sans", sans-serif;
    font-size: 16px;
    font-style: normal;
    font-weight: var(--weight-body);
    font-variation-settings: "wght" var(--weight-body);
    line-height: normal;
    color: #000;
    pointer-events: none;
  }

  @media (max-width: 600px) {
    .lb-slide {
      padding: 56px 12px 64px;
    }

    .lb-caption {
      left: 16px;
      right: 16px;
      bottom: 16px;
    }
  }

`;

const items = collectSlides();
preloadStills(items);
preloadVideos(items);

if (items.length > 0) {
  document.head.append(style);
  const host = document.createElement("div");
  document.body.append(host);
  createRoot(host).render(<App items={items} />);
}
