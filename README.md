# FTGO Order Lookup

Look up an order by ID using the FTGO API gateway. The page displays the order ID and current status.

## Run locally

Use Node.js 20 or later. Start the FTGO API gateway and its backing services. FTGO's Docker Compose
setup exposes the gateway at `http://127.0.0.1:8087`.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4173` and enter an order ID from the running FTGO environment.
Set `FTGO_GATEWAY_URL` to use another gateway origin.

```sh
FTGO_GATEWAY_URL=http://127.0.0.1:9000 npm run dev
```

The local server forwards `GET /orders/{orderId}` to the configured gateway on the same path.
For standalone hosting, run `npm run build`, serve `dist/`, and route `GET /orders/{orderId}` to the
gateway on the same origin.

## Source path for HPG

The submit handler in [src/app.ts](src/app.ts) reads the order ID and passes it to
`lookupOrder` in [src/api.ts](src/api.ts). That function sends the ID in the HTTP path and reads
`orderInfo.orderId` and `orderInfo.state` from the gateway response.

The Java route is `OrderHandlers.getOrderDetails` → `OrderServiceProxy.findOrderById` →
`OrderController.getOrder` → `orderRepository.findById`. The frontend request and gateway
route provide the two source anchors for a future cross-repository HTTP edge.
[FTGO gateway route](https://github.com/Holonic-Technologies/ftgo-application/blob/master/ftgo-api-gateway/src/main/java/net/chrisrichardson/ftgo/apiagateway/orders/OrderConfiguration.java#L36)

## Cross-repository order lookup check

The FTGO cross-repository impact workflow compares the exact base and head of a
frontend pull request with the pinned Java order lookup on
`srswinde/ftgo-application`. The workflow summary shows the observed repository
lookup IDs. Download the `ftgo-cross-repository-impact` artifact and open
`index.html` to replay the trace. Use **Run workflow** with a frontend PR number
to replay an existing PR.

The check runs the compiled browser API client and the Node proxy over loopback
HTTP, verifies the Java WebFlux routing from source, and executes the pinned
Java controller method with a recording repository. The check reports observed
changes using fixture IDs 123 and 125 and uploads the supporting source links.
