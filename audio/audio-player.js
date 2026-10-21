// Listening list. One shared <audio> element, with lock-screen controls
// through the Media Session API. Files live under ./audio/.

const SEEK_OFFSET_SECONDS = 10;
const RESTART_THRESHOLD_SECONDS = 3;
const ARTWORK_SIZES = ["96x96", "128x128", "192x192", "256x256", "384x384", "512x512"];
const SESSION_ACTIONS = [
  "play",
  "pause",
  "previoustrack",
  "nexttrack",
  "seekbackward",
  "seekforward",
  "seekto",
];

const TRACKS = [
  {
    id: "simone",
    title: "I Wish I Knew How It Would Feel to Be Free",
    artist: "Nina Simone",
    album: "Miss Simone: The Hits",
    src: "audio/I Wish I Knew How It Would Feel to Be Free - Nina Simone.m4a",
    artwork: "audio/artwork/i-wish.jpg",
  },
  {
    id: "scorpions",
    title: "Saat Alfarah",
    artist: "The Scorpions, Saif Abu Bakr",
    album: "Jazz, Jazz, Jazz (Habibi Funk 009)",
    src: "audio/Saat Alfarah - The Scorpions, Saif Abu Bakr.m4a",
    artwork: "audio/artwork/saat-alfarah.jpg",
  },
  {
    id: "shorter",
    title: "Ponta de Areia",
    artist: "Wayne Shorter",
    src: "audio/Ponta de Areia - Wayne Shorter.mp3",
    artwork: "audio/artwork/shorter.jpeg",
  },
  {
    id: "molloy",
    title: "The Morning Thrush",
    artist: "Matt Molloy",
    src: "audio/The Morning Thrush - Matt Molloy.mp3",
    artwork: "audio/artwork/molloy.jpeg",
  },
  {
    id: "star-moles",
    title: "Overdog",
    artist: "Star Moles",
    src: "audio/Overdog - Star Moles.mp3",
    artwork: "audio/artwork/starmoles.jpg",
  },
];

let restoredTitle = null;
let nowPlayingTitle = null;

function mediaSessionSupported() {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

function absoluteUrl(path) {
  return new URL(path, document.baseURI).href;
}

function applyNowPlayingTitle(track) {
  if (track) {
    const nextTitle = `${track.title} · ${track.artist}`;
    if (restoredTitle === null) restoredTitle = document.title;
    nowPlayingTitle = nextTitle;
    document.title = nextTitle;
    return;
  }
  if (restoredTitle !== null && document.title === nowPlayingTitle) {
    document.title = restoredTitle;
  }
  restoredTitle = null;
  nowPlayingTitle = null;
}

function applyMediaSessionMetadata(track) {
  if (!mediaSessionSupported()) {
    applyNowPlayingTitle(track);
    return;
  }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album ?? "",
    artwork: ARTWORK_SIZES.map((sizes) => ({
      src: absoluteUrl(track.artwork),
      sizes,
      type: "image/jpeg",
    })),
  });
  applyNowPlayingTitle(track);
}

function applyMediaSessionPlaybackState(state) {
  if (!mediaSessionSupported()) return;
  navigator.mediaSession.playbackState = state;
}

function applyMediaSessionPosition(audio) {
  if (!mediaSessionSupported() || typeof navigator.mediaSession.setPositionState !== "function") {
    return;
  }
  const { duration, currentTime, playbackRate } = audio;
  if (!Number.isFinite(duration) || duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1,
      position: Math.max(0, Math.min(currentTime, duration)),
    });
  } catch {
    // Safari throws if position and duration disagree while the source changes.
  }
}

function setMediaSessionActionHandler(action, handler) {
  if (!mediaSessionSupported()) return;
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // Browsers throw for actions they don't implement.
  }
}

function bindMediaSessionActionHandlers(handlers) {
  for (const action of SESSION_ACTIONS) {
    setMediaSessionActionHandler(action, handlers[action] ?? null);
  }
  return () => {
    for (const action of SESSION_ACTIONS) {
      setMediaSessionActionHandler(action, null);
    }
  };
}

function clearNowPlaying() {
  applyNowPlayingTitle(null);
  if (!mediaSessionSupported()) return;
  navigator.mediaSession.metadata = null;
  navigator.mediaSession.playbackState = "none";
}

class AudioPlayer extends HTMLElement {
  #audio = null;
  #buttons = [];
  #currentId = null;
  #playing = false;
  #loading = false;
  #generation = 0;
  #mounted = false;
  #unbindSession = null;

  connectedCallback() {
    if (!this.#mounted) {
      this.#mounted = true;
      this.#mount();
    }
    if (this.#unbindSession) return;
    this.#unbindSession = bindMediaSessionActionHandlers({
      play: () => this.#onSessionPlay(),
      pause: () => this.#stop(),
      nexttrack: () => this.#playNext(),
      previoustrack: () => this.#playPrevious(),
      seekbackward: (details) => this.#seekBy(-(details.seekOffset || SEEK_OFFSET_SECONDS)),
      seekforward: (details) => this.#seekBy(details.seekOffset || SEEK_OFFSET_SECONDS),
      seekto: (details) => {
        const audio = this.#audio;
        if (!audio || details.seekTime == null) return;
        audio.currentTime = details.seekTime;
        applyMediaSessionPosition(audio);
      },
    });
  }

  disconnectedCallback() {
    this.#generation += 1;
    this.#audio?.pause();
    this.#unbindSession?.();
    this.#unbindSession = null;
    clearNowPlaying();
  }

  #mount() {
    const audio = document.createElement("audio");
    audio.preload = "none";
    audio.playsInline = true;
    audio.hidden = true;
    audio.addEventListener("loadedmetadata", () => {
      const track = this.#currentTrack();
      if (track) {
        applyMediaSessionMetadata(track);
        applyMediaSessionPosition(audio);
      }
    });
    audio.addEventListener("playing", () => {
      this.#playing = true;
      this.#loading = false;
      this.#paint();
      const track = this.#currentTrack();
      if (track) this.#sync(track, true);
    });
    audio.addEventListener("waiting", () => {
      if (!audio.paused) {
        this.#loading = true;
        this.#paint();
      }
    });
    audio.addEventListener("ended", () => this.#playNext());
    audio.addEventListener("error", () => {
      this.#playing = false;
      this.#loading = false;
      this.#paint();
      const track = this.#currentTrack();
      if (track) this.#sync(track, false);
    });
    this.#audio = audio;
    this.append(audio);

    for (const track of TRACKS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "row track-button";
      button.dataset.trackId = track.id;

      const label = document.createElement("span");
      label.className = "track";
      const title = document.createElement("span");
      title.className = "track-title";
      title.textContent = track.title;
      const artist = document.createElement("span");
      artist.className = "track-artist";
      artist.textContent = track.artist;
      label.append(title, artist);

      const status = document.createElement("span");
      status.className = "track-status";
      const play = document.createElement("icon-play");
      const pause = document.createElement("icon-pause");
      const spinner = document.createElement("icon-spinner");
      pause.hidden = true;
      spinner.hidden = true;
      status.append(play, pause, spinner);

      button.append(label, status);
      button.addEventListener("click", () => this.#toggle(track));
      this.#buttons.push(button);
      this.append(button);
    }

    this.#paint();
  }

  #currentTrack() {
    return TRACKS.find((track) => track.id === this.#currentId) ?? null;
  }

  #sync(track, isPlaying) {
    applyMediaSessionMetadata(track);
    applyMediaSessionPlaybackState(isPlaying ? "playing" : "paused");
    if (this.#audio) applyMediaSessionPosition(this.#audio);
  }

  #stop() {
    this.#generation += 1;
    this.#audio?.pause();
    this.#playing = false;
    this.#loading = false;
    this.#paint();
    const track = this.#currentTrack();
    if (track) this.#sync(track, false);
  }

  #start(audio) {
    const generation = ++this.#generation;
    if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      this.#loading = true;
    }
    this.#playing = true;
    this.#paint();
    const track = this.#currentTrack();
    if (track) this.#sync(track, true);

    audio.play().then(
      () => {
        if (generation !== this.#generation || audio.paused) return;
        const current = this.#currentTrack();
        if (current) this.#sync(current, true);
      },
      () => {
        if (generation !== this.#generation) return;
        this.#playing = false;
        this.#loading = false;
        this.#paint();
        const current = this.#currentTrack();
        if (current) this.#sync(current, false);
      },
    );
  }

  #playTrack(track) {
    const audio = this.#audio;
    if (!audio) return;
    audio.src = absoluteUrl(track.src);
    this.#currentId = track.id;
    this.#sync(track, true);
    this.#start(audio);
  }

  #playAtIndex(index) {
    const nextIndex = (index + TRACKS.length) % TRACKS.length;
    this.#playTrack(TRACKS[nextIndex]);
  }

  #playNext() {
    const index = TRACKS.findIndex((track) => track.id === this.#currentId);
    this.#playAtIndex(index < 0 ? 0 : index + 1);
  }

  #playPrevious() {
    const audio = this.#audio;
    if (audio && audio.currentTime > RESTART_THRESHOLD_SECONDS) {
      audio.currentTime = 0;
      applyMediaSessionPosition(audio);
      return;
    }
    const index = TRACKS.findIndex((track) => track.id === this.#currentId);
    this.#playAtIndex(index < 0 ? 0 : index - 1);
  }

  #toggle(track) {
    const audio = this.#audio;
    if (!audio) return;
    if (this.#currentId === track.id) {
      if (this.#playing || this.#loading) this.#stop();
      else this.#start(audio);
      return;
    }
    this.#playTrack(track);
  }

  #seekBy(offset) {
    const audio = this.#audio;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + offset));
    applyMediaSessionPosition(audio);
  }

  #onSessionPlay() {
    const audio = this.#audio;
    if (!audio) return;
    const track = this.#currentTrack() ?? TRACKS[0];
    if (this.#currentId !== track.id) {
      this.#playTrack(track);
      return;
    }
    this.#start(audio);
  }

  #paint() {
    for (const button of this.#buttons) {
      const track = TRACKS.find((item) => item.id === button.dataset.trackId);
      const current = track.id === this.#currentId;
      const loading = current && this.#loading;
      const playing = current && this.#playing && !this.#loading;
      button.setAttribute("aria-pressed", playing ? "true" : "false");
      if (loading) button.setAttribute("aria-busy", "true");
      else button.removeAttribute("aria-busy");
      button.setAttribute(
        "aria-label",
        loading ? `Loading ${track.title}` : playing ? `Pause ${track.title}` : `Play ${track.title}`,
      );
      button.querySelector("icon-play").hidden = playing || loading;
      button.querySelector("icon-pause").hidden = !playing;
      button.querySelector("icon-spinner").hidden = !loading;
    }
  }
}

customElements.define("audio-player", AudioPlayer);
