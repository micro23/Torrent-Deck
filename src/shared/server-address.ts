export interface ParsedServerAddressInput {
    hostname: string
    protocol?: string
    port?: number
    hasExplicitProtocol: boolean
    hasExplicitPort: boolean
}

export interface SanitizableServerAddress {
    ip: string
    proto: string
    port: number
}

const SUPPORTED_PROTOCOLS = new Set(["http", "https"])

export function parseServerAddressInput(input: unknown, fallbackProtocol = "http"): ParsedServerAddressInput {
    const address = String(input || "").trim()
    const baseProtocol = String(fallbackProtocol || "http").replace(/:$/, "")
    const protocolMatch = address.match(/^([a-z][a-z\d+.-]*):\/\//i)

    try {
        const parsed = new URL(protocolMatch ? address : `${baseProtocol}://${address}`)
        const parsedProtocol = parsed.protocol.replace(/:$/, "").toLowerCase()
        const protocol = protocolMatch && SUPPORTED_PROTOCOLS.has(parsedProtocol) ? parsedProtocol : undefined
        // URL.port omits an explicit scheme default such as :443. The server
        // field still needs that port to override a previously saved port.
        const authority = address.slice(protocolMatch?.[0].length || 0).split(/[/?#\\]/, 1)[0]
        const host = authority.slice(authority.lastIndexOf("@") + 1)
        const portText = parsed.port || /^(?:\[[^\]]+\]|[^:]+):(\d+)$/.exec(host)?.[1]
        const port = portText ? Number(portText) : undefined

        return {
            hostname: parsed.hostname.replace(/^\[|\]$/g, ""),
            protocol,
            port,
            hasExplicitProtocol: !!protocol,
            hasExplicitPort: port !== undefined,
        }
    } catch (_err) {
        return {
            hostname: protocolMatch ? address.replace(protocolMatch[0], "") : address.replace(/^\[|\]$/g, ""),
            protocol: undefined,
            port: undefined,
            hasExplicitProtocol: false,
            hasExplicitPort: false,
        }
    }
}

export function sanitizeServerAddress<T extends SanitizableServerAddress>(server: T): T {
    const parsed = parseServerAddressInput(server.ip, server.proto)

    return {
        ...server,
        ip: parsed.hostname,
        proto: parsed.protocol || server.proto,
        port: parsed.port ?? server.port,
    }
}
