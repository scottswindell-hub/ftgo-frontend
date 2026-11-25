import { lookupOrder, OrderLookupError } from './api.js';

function getElement<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element ${id}`);
  return node as T;
}

const form = getElement<HTMLFormElement>('lookup-form');
const input = getElement<HTMLInputElement>('order-id');
const requestPath = getElement('request-path');
const result = getElement('result');
const message = getElement('message');
const details = getElement('order-details');
const orderNumber = getElement('result-order-id');
const orderState = getElement('result-state');

let activeRequest: AbortController | undefined;

function setResult(state: 'loading' | 'success' | 'error', text: string) {
  result.dataset.state = state;
  details.hidden = state !== 'success';
  message.textContent = text;
}

input.addEventListener('input', () => input.removeAttribute('aria-invalid'));

async function submitLookup(event: SubmitEvent) {
  event.preventDefault();
  activeRequest?.abort();
  activeRequest = undefined;

  const orderId = input.value.trim();
  if (!/^[1-9][0-9]{0,18}$/.test(orderId) || BigInt(orderId) > 9223372036854775807n) {
    input.setAttribute('aria-invalid', 'true');
    requestPath.textContent = '/orders/{orderId}';
    setResult('error', 'Enter a valid positive order ID.');
    input.focus();
    return;
  }

  input.removeAttribute('aria-invalid');
  requestPath.textContent = `/orders/${orderId}`;
  setResult('loading', `Looking up order ${orderId}…`);
  const controller = new AbortController();
  activeRequest = controller;

  try {
    const order = await lookupOrder(orderId, controller.signal);
    if (controller.signal.aborted) return;
    orderNumber.textContent = order.orderId;
    orderState.textContent = order.state.replaceAll('_', ' ').toLowerCase()
      .replace(/^./, first => first.toUpperCase());
    setResult('success', `Order ${order.orderId} found.`);
  } catch (error) {
    if (controller.signal.aborted) return;
    setResult('error', error instanceof OrderLookupError ? error.message : 'Order lookup failed. Try again.');
  } finally {
    if (activeRequest === controller) activeRequest = undefined;
  }
}

form.addEventListener('submit', submitLookup);
