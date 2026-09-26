import type { InvokeChannel } from './channels'
import type { ChannelInput, ChannelOutput } from './contract'
import type { Result } from './result'

// Tipe `window.api` diturunkan otomatis dari daftar kanal: kanal `domain:action`
// menjadi fungsi `window.api.domain.action(input)` yang mengembalikan Result.

type DomainOf<C extends string> = C extends `${infer D}:${string}` ? D : never
type ActionOf<C extends string, D extends string> = C extends `${D}:${infer A}` ? A : never

// Kanal dengan input `void` dipanggil tanpa argumen.
type InvokeFunction<C extends InvokeChannel> = [ChannelInput<C>] extends [void]
  ? () => Promise<Result<ChannelOutput<C>>>
  : (input: ChannelInput<C>) => Promise<Result<ChannelOutput<C>>>

export type InvokeApi = {
  readonly [D in DomainOf<InvokeChannel>]: {
    readonly [A in ActionOf<InvokeChannel, D>]: InvokeFunction<Extract<`${D}:${A}`, InvokeChannel>>
  }
}

export type Api = InvokeApi & {
  readonly platform: string
}
