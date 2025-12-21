/**
 * 
 * @returns 
 * @deprecated see {@link draw}
 */
export function magicWords() {
  return "hello world"
}

export function draw(timeInMS:number, context:CanvasRenderingContext2D) {
  context.fillStyle="red";
  context.fillRect(0, 0, 3840,2160);
  context.font="240px monospace";
  context.fillStyle="white";
  let seconds = timeInMS / 1000;
  let minutes = Math.floor(seconds / 60);
  seconds %= 60;
  let secondsString = seconds.toFixed(4);
  if (secondsString[1] == '.') {
    secondsString = "0" + secondsString;
  }
  const time = `${minutes}:${secondsString}`;
  context.fillText(time, 240,240);
}