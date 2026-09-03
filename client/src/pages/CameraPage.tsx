import { useCallback, useEffect, useRef, useState } from "react";
import "./CameraPage.css";
import "../lib/reader.js";

interface CameraPageProps {
  onLogout: () => void;
}

declare class MediaMTXWebRTCReader {
  constructor(options: {
    url: string;
    user: string;
    pass: string;
    token: string;
    onError: (error: unknown) => void;
    onTrack: (event: RTCTrackEvent) => void;
  });

  close(): void;
}

type CameraStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

const WHEP_URL =
  import.meta.env.VITE_WEBRTC_URL;

const RECONNECT_DELAY = 3000;

export default function CameraPage({
  onLogout,
}: CameraPageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const readerRef =
    useRef<MediaMTXWebRTCReader | null>(null);

  const reconnectTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const mountedRef = useRef(false);

  const connectingRef = useRef(false);

  const [status, setStatus] =
    useState<CameraStatus>("connecting");

  const closeReader = useCallback(() => {
    if (readerRef.current) {
      console.log("Closing WebRTC reader");

      try {
        readerRef.current.close();
      } catch (error) {
        console.warn(
          "Error closing WebRTC reader:",
          error
        );
      }

      readerRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    if (reconnectTimerRef.current !== null) {
      return;
    }

    console.log(
      `WebRTC reconnect scheduled in ${RECONNECT_DELAY}ms`
    );

    setStatus("reconnecting");

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;

      if (!mountedRef.current) {
        return;
      }

      connect();
    }, RECONNECT_DELAY);
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    if (connectingRef.current) {
      return;
    }

    connectingRef.current = true;

    closeReader();

    setStatus("connecting");

    console.log(
      "Creating new MediaMTX WebRTC reader..."
    );

    try {
      const token = localStorage.getItem("cameraToken") || "";
      const reader = new MediaMTXWebRTCReader({
        url: WHEP_URL,

        user: "",
        pass: "",
        token,

        onError: (error) => {
          console.error(
            "MediaMTX WebRTC error:",
            error
          );

          connectingRef.current = false;

          if (!mountedRef.current) {
            return;
          }

          closeReader();

          setStatus("error");

          scheduleReconnect();
        },

        onTrack: (event) => {
          console.log(
            "MediaMTX WebRTC track received"
          );

          if (
            videoRef.current &&
            event.streams.length > 0
          ) {
            videoRef.current.srcObject =
              event.streams[0];

            videoRef.current
              .play()
              .catch((error) => {
                console.warn(
                  "Video autoplay failed:",
                  error
                );
              });

            setStatus("connected");

            connectingRef.current = false;
          }
        },
      });

      readerRef.current = reader;
    } catch (error) {
      console.error(
        "Failed to create MediaMTX reader:",
        error
      );

      connectingRef.current = false;

      setStatus("error");

      scheduleReconnect();
    }
  }, [closeReader, scheduleReconnect]);

  useEffect(() => {
    mountedRef.current = true;

    connect();

    return () => {
      mountedRef.current = false;

      if (reconnectTimerRef.current !== null) {
        clearTimeout(
          reconnectTimerRef.current
        );

        reconnectTimerRef.current = null;
      }

      connectingRef.current = false;

      closeReader();
    };
  }, [connect, closeReader]);

  const statusText = {
    connecting: "Connecting...",
    connected: "Live",
    reconnecting: "Reconnecting...",
    error: "Camera unavailable — retrying...",
  }[status];

  return (
    <div className="camera-page">
      <header className="camera-header">
        <div>
          <h1>Raspberry Pi Camera</h1>

          <span
            className={`camera-status ${status}`}
          >
            <span className="status-dot">
              ●
            </span>

            {statusText}
          </span>
        </div>

        <button
          className="logout-button"
          onClick={onLogout}
        >
          Logout
        </button>
      </header>

      <main className="camera-content">
        <div className="camera-container">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
          />

          {status !== "connected" && (
            <div className="camera-overlay">
              <div className="camera-message">
                <div className="spinner" />

                <span>
                  {status === "error"
                    ? "Camera unavailable — retrying..."
                    : status === "reconnecting"
                      ? "Reconnecting..."
                      : "Connecting to camera..."}
                </span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}