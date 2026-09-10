export const flightIntroEndTime = 4.5;
export const flightIntroFallbackDelayMs = 6500;
const wheelDeadZone = 20;

export function shouldPauseFlightIntro(
  currentTime: number,
  isContinuingToDestination: boolean,
  isPromptVisible: boolean,
): boolean {
  return (
    currentTime >= flightIntroEndTime &&
    !isContinuingToDestination &&
    !isPromptVisible
  );
}

export function shouldRevealFlightDestinationOnFallback(
  isContinuingToDestination: boolean,
  isPromptVisible: boolean,
): boolean {
  return !isContinuingToDestination && !isPromptVisible;
}

export function getDestinationWheelDirection(deltaY: number): -1 | 0 | 1 {
  if (Math.abs(deltaY) < wheelDeadZone) {
    return 0;
  }

  return deltaY > 0 ? 1 : -1;
}
