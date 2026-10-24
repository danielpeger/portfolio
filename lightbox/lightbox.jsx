// Lightbox for the hero and the images and videos inside an article.
// Leave one out with data-lightbox="off" on that element.
// A still opens <its src folder>/full.avif. A video opens its own src.
//
// Stills use ramka as documented: imageRef on the page <img> bridges the
// already-decoded thumbnail, Media width/height sizes the morph, and the
// default awaitImageDecode waits briefly for full.avif. Videos stay custom
// below — Safari will not snapshot a <video> into a view transition, and
// these files have no poster image for Trigger crossfade="close".

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

// One frame from the page video, used as the lightbox poster so Media can
// bridge pixels the way it does for an <img>. There is no poster file.
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
    // Tainted or not paintable yet. The open wait below covers that case.
  }
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

// Cap a video at one device pixel per source pixel. Its width attribute is
// the file size. Stills use Media's fit-box; their full.avif size is not
// known until that file loads, which is ramka's own decode wait.
function useDevicePixelRatio() {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);

  useEffect(() => {
    const media = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = () => setDpr(window.devicePixelRatio || 1);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [dpr]);

  return dpr;
}

function waitForVideoFrame(destination, signal) {
  const video = destination?.querySelector("video");
  if (!video || video.readyState >= 2 || video.getAttribute("poster")) return;
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", finish);
      resolve();
    };
    const timer = setTimeout(finish, 1500);
    video.addEventListener("loadeddata", finish, { once: true });
    signal.addEventListener("abort", finish, { once: true });
  });
}

function VideoSlide({ item, active, dpr }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) video.play().catch(() => {});
    else video.pause();
  }, [active]);

  // A live frame for the Safari close, which cannot snapshot <video>.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active) return undefined;
    const canvas = document.createElement("canvas");
    canvas.dataset.lbStill = "1";
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
    const parent = video.parentElement;
    if (parent && getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }
    video.lbStill = canvas;
    let frame = 0;
    const draw = () => {
      if (canvas.dataset.lbFlying === "1") return;
      if (parent && !canvas.isConnected) parent.appendChild(canvas);
      if (video.videoWidth) {
        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.dataset.lbReady = "1";
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      if (canvas.dataset.lbFlying !== "1") canvas.remove();
      if (video.lbStill === canvas) video.lbStill = null;
    };
  }, [active]);

  return (
    <Lightbox.Media
      width={item.width}
      height={item.height}
      style={{
        maxWidth: `${item.width / dpr}px`,
        maxHeight: `${item.height / dpr}px`,
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <video
        ref={videoRef}
        src={item.src}
        poster={videoPosters.get(item.src) || undefined}
        width={item.width}
        height={item.height}
        muted
        loop
        playsInline
      />
    </Lightbox.Media>
  );
}

// The page is static HTML. Ramka's trigger has to own the existing element
// so the morph starts there, and imageRef has to see the shadow-DOM <img>.
function PageTrigger({ item, index }) {
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

  return createPortal(
    <Lightbox.Trigger
      index={index}
      aria-label={item.alt || item.caption || (item.video ? "Video" : "Image")}
    >
      {({ imageRef, morphRef }) => (
        <Adopted element={item.el} imageRef={imageRef} morphRef={morphRef} />
      )}
    </Lightbox.Trigger>,
    slot,
  );
}

function Adopted({ element, imageRef, morphRef }) {
  const hold = useCallback(
    (node) => {
      if (node && element.parentNode !== node) node.appendChild(element);
    },
    [element],
  );

  useLayoutEffect(() => {
    morphRef(element);
    const img = element.shadowRoot?.querySelector("img");
    if (img) imageRef(img);
    return () => {
      morphRef(null);
      if (img) imageRef(null);
    };
  }, [element, imageRef, morphRef]);

  return <span ref={hold} style={{ display: "contents" }} />;
}

function App({ items }) {
  const dpr = useDevicePixelRatio();
  const several = items.length > 1;

  return (
    <Lightbox.Root
      license="gpl"
      loop={several}
      onBeforeOpen={({ destination, signal }) =>
        waitForVideoFrame(destination, signal)
      }
      onBeforeClose={({ destination }) => {
        destination?.querySelector("video")?.pause();
      }}
    >
      {items.map((item, i) => (
        <PageTrigger key={item.src} item={item} index={i} />
      ))}
      <Lightbox.Portal>
        <Lightbox.Backdrop className="lb-backdrop" />
        <Lightbox.Content className="lb-content" aria-label="Viewer">
          <Lightbox.Slides
            className="lb-slides"
            aria-label="Article media"
            aria-roledescription="carousel"
          >
            {items.map((item, i) => (
              <Lightbox.Slide key={item.src} className="lb-slide">
                <Lightbox.Item
                  index={i}
                  caption={item.caption}
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${items.length}`}
                >
                  {item.video
                    ? ({ active }) => (
                        <Lightbox.Zoom>
                          <VideoSlide item={item} active={active} dpr={dpr} />
                        </Lightbox.Zoom>
                      )
                    : (
                        <Lightbox.Zoom>
                          <Lightbox.Media width={item.width} height={item.height}>
                            <img
                              src={item.src}
                              alt={item.alt}
                              width={item.width}
                              height={item.height}
                              loading="eager"
                              decoding="async"
                            />
                          </Lightbox.Media>
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
          <Lightbox.Caption
            className="lb-caption"
            render={
              several
                ? (props, state) => {
                    const { children, ...rest } = props;
                    return (
                      <div {...rest}>
                        {children ? (
                          <span className="lb-caption-text">{children}</span>
                        ) : null}
                        <span className="lb-dots" aria-hidden="true">
                          {items.map((item, i) => (
                            <span
                              key={item.src}
                              className="lb-dot"
                              data-active={i === state.index ? "" : undefined}
                            />
                          ))}
                        </span>
                      </div>
                    );
                  }
                : undefined
            }
          />
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

  [data-ramka-media] > img,
  [data-ramka-media] > video {
    object-fit: cover;
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
  }

  .lb-slides {
    flex: 1;
    min-width: 0;
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
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
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

  .lb-caption-text {
    min-width: 0;
    max-width: 100%;
  }

  .lb-dots {
    display: none;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .lb-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.28;
  }

  .lb-dot[data-active] {
    opacity: 1;
  }

  @media (max-width: 600px) {
    .lb-backdrop {
      background: #fff;
    }

    .lb-prev,
    .lb-next {
      display: none;
    }

    .lb-slide {
      padding: 56px 12px 80px;
    }

    .lb-caption {
      left: 16px;
      right: 16px;
      bottom: 16px;
    }

    .lb-dots {
      display: flex;
    }
  }
`;

function closeWithStill(callback) {
  const host = [...document.querySelectorAll("*")].find(
    (el) => el.style.viewTransitionName === "lightbox-morph",
  );
  const canvas = host?.querySelector("[data-lb-still]");
  if (
    !host ||
    !canvas ||
    canvas.dataset.lbReady !== "1" ||
    !("GestureEvent" in window)
  ) {
    return null;
  }
  const from = host.getBoundingClientRect();
  canvas.dataset.lbFlying = "1";
  canvas.style.cssText = `position:fixed;left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;z-index:2147483646;pointer-events:none;margin:0;`;
  document.body.appendChild(canvas);
  callback();
  const dest = [...document.querySelectorAll("*")].find(
    (el) => el.style.viewTransitionName === "lightbox-morph",
  );
  const to = dest?.getBoundingClientRect() || from;
  const previousVisibility = dest?.style.visibility ?? "";
  if (dest) dest.style.visibility = "hidden";
  const anim = canvas.animate(
    [
      {
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
      },
      {
        left: `${to.left}px`,
        top: `${to.top}px`,
        width: `${to.width}px`,
        height: `${to.height}px`,
      },
    ],
    { duration: 360, easing: "cubic-bezier(0.44, 0.58, 0, 1)", fill: "both" },
  );
  const finished = anim.finished.finally(() => {
    if (dest?.isConnected) dest.style.visibility = previousVisibility;
    canvas.remove();
  });
  return {
    ready: Promise.resolve(),
    finished,
    updateCallbackDone: finished,
    skipTransition() {},
  };
}

if (typeof document.startViewTransition === "function") {
  const nativeStart = document.startViewTransition.bind(document);
  document.startViewTransition = (callback) => {
    const phase = document.documentElement.getAttribute(
      "data-ramka-view-transition",
    );
    if (phase === "closing") {
      const still = closeWithStill(callback);
      if (still) return still;
    }
    return nativeStart(callback);
  };
}

const items = collectSlides();
preloadVideos(items);

if (items.length > 0) {
  document.head.append(style);
  const host = document.createElement("div");
  document.body.append(host);
  createRoot(host).render(<App items={items} />);
}
