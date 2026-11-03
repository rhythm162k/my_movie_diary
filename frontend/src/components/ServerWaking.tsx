import { useEffect, useState } from "react";
import LoadingSVG from "./LoadingSVG";
import "./ServerWaking.css";

// Shown while the very first request (the session check) is still waiting.
// Free hosting puts the server to sleep when idle, so waking it can take a
// while. The screen only appears after a short delay, so a fast response
// never flashes it.
const SHOW_AFTER_MS = 1500;

export default function ServerWaking() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <main className="waking-page" role="status" aria-live="polite">
      <div className="waking-card">
        <img className="waking-logo" src="/app-logo.png" alt="app logo" />

        <div className="waking-spinner">
          <LoadingSVG />
        </div>

        <h1>Waking up the server...</h1>
        <p>
          This app runs on free hosting, so the server goes to sleep when
          nobody is using it. The first load can take up to a minute. Thanks
          for your patience!
        </p>
      </div>
    </main>
  );
}
