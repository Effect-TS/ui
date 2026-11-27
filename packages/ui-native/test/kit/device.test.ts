import * as device from "@effect/ui-native/kit/internal/device"
import { assert, describe, it } from "vitest"
import * as FakeDevice from "../utils/FakeDevice.ts"

describe("kit/internal/device", () => {
  it("sends only the latest value for a change reported before the Subscription starts", async () => {
    const fake = FakeDevice.make("ios")
    let latest = "launch"
    const listener = await FakeDevice.listen(
      fake.device,
      (got) =>
        device.subscription(
          "changing",
          got,
          (_, send) => {
            latest = "changed"
            send(latest)
            return () => {}
          },
          () => latest
        )
    )
    await listener.settle()
    assert.deepStrictEqual(listener.values(), ["changed"])
    await listener.close()
  })
})
