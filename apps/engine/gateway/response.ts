export interface GatewayResponse {
    status: number;
    body: string;
    headers?: Record<string, string>;
}
