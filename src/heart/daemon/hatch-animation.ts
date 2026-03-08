import { emitNervesEvent } from "../../nerves/runtime"

const EGG = "\uD83E\uDD5A"
const SNAKE = "\uD83D\uDC0D"
const DOTS = " . . . "

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Play the hatch animation: egg -> dots -> snake + name.
 * The writer function receives each chunk. Default writer is process.stderr.write.
 */
export async function playHatchAnimation(
  hatchlingName: string,
  writer?: (text: string) => void,
): Promise<void> {
  emitNervesEvent({
    component: "daemon",
    event: "daemon.hatch_animation_start",
    message: "playing hatch animation",
    meta: { hatchlingName },
  })

  const write = writer ?? ((text: string) => process.stderr.write(text))

  write(`\n  ${EGG}`)
  await wait(400)
  write(DOTS)
  await wait(400)
  write(`${SNAKE} \x1b[1m${hatchlingName}\x1b[0m\n\n`)
}
