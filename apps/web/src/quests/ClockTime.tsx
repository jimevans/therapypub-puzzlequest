import { useEffect, useState } from "react";
import { type Clock, elapsedAt, formatDuration, totalAt } from "./clock";

interface ClockTimeProps {
  clock: Clock;
  /** Whether to show the time spent, or that plus penalties. */
  show: "elapsed" | "total";
  className?: string;
}

const timeAt = { elapsed: elapsedAt, total: totalAt };

/** Keeps time while a clock runs. It's mounted anew each time one starts. */
function RunningTime({ clock, show, className }: ClockTimeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className={className} role="timer">
      {formatDuration(timeAt[show](clock, now))}
    </span>
  );
}

/** Shows a clock's time, which counts up while the clock runs. */
export function ClockTime({ clock, show, className }: ClockTimeProps) {
  return clock.running ? (
    <RunningTime clock={clock} show={show} className={className} />
  ) : (
    <span className={className}>
      {formatDuration(show === "total" ? clock.totalMs : clock.elapsedMs)}
    </span>
  );
}
