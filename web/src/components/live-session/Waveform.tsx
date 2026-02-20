/**
 * Waveform Visualization Component
 *
 * Displays a thin horizontal bar with 32 amplitude bars that animate
 * in response to audio input. Used during voice recording to provide
 * visual feedback that audio is being captured.
 */

import type { HTMLAttributes } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface WaveformProps extends HTMLAttributes<HTMLDivElement> {
  /** Array of 32 amplitude values (0-255) from the AnalyserNode */
  data: number[];
}

// =============================================================================
// Component
// =============================================================================

/**
 * Thin horizontal waveform visualization with 32 amplitude bars.
 * Each bar scales its height based on the corresponding amplitude value.
 */
export function Waveform({ data, className = '', ...props }: WaveformProps) {
  return (
    <div
      className={`h-8 flex items-center justify-center gap-[2px] ${className}`}
      aria-label="Audio waveform visualization"
      role="img"
      {...props}
    >
      {data.map((amplitude, i) => {
        // Normalize amplitude (0-255) to a height percentage (min 8%, max 100%)
        const heightPercent = Math.max(8, (amplitude / 255) * 100);

        return (
          <div
            key={i}
            className="w-1 rounded-full bg-clarity-400 transition-all duration-75"
            style={{ height: `${heightPercent}%` }}
          />
        );
      })}
    </div>
  );
}

export default Waveform;
