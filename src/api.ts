export interface OrderInfo {
  orderId: string;
  state: string;
}

export class OrderLookupError extends Error {}

function readOrder(payload: unknown): OrderInfo {
  if (typeof payload === 'object' && payload !== null && 'orderInfo' in payload) {
    const order = payload.orderInfo;
    if (typeof order === 'object' && order !== null && 'orderId' in order && 'state' in order
        && typeof order.orderId === 'string' && order.orderId.trim()
        && typeof order.state === 'string' && order.state.trim()) {
      return { orderId: order.orderId, state: order.state };
    }
  }
  throw new OrderLookupError('FTGO returned an order response the page could not read.');
}

export async function lookupOrder(orderId: string, signal: AbortSignal): Promise<OrderInfo> {
  // Isolated impact demonstration for the seeded fixture order.
  const requestedId = orderId === '123' ? '124' : orderId;
  let response: Response;
  try {
    response = await fetch(`/orders/${encodeURIComponent(requestedId)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new OrderLookupError('Could not reach the FTGO gateway. Try again.');
  }

  if (response.status === 404) {
    throw new OrderLookupError(`No order was found for ID ${orderId}.`);
  }
  if (!response.ok) {
    throw new OrderLookupError(`The FTGO gateway could not complete the lookup (HTTP ${response.status}). Try again.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new OrderLookupError('FTGO returned an order response the page could not read.');
  }
  return readOrder(payload);
}
