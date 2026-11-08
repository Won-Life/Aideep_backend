# Datadog monitoring

The production image preloads `dd-trace/init` before NestJS, Express, Winston,
PostgreSQL and Redis are loaded. Compose enables APM, Node.js runtime metrics
and JSON log correlation for the `aideep-backend` service in the `prod` environment.
`DD_VERSION` defaults to the deployed image tag.

The existing `dd-agent` exposes `/var/run/datadog/apm.socket` and
`/var/run/datadog/dsd.socket` through a host bind mount. Compose mounts this
directory into the application. No public APM port or application API key is needed.
The trace-loader starts the Trace Agent on the first incoming trace connection;
an idle Agent can initially report that the APM Agent is not running.

## Agent configuration

Keep these settings in the deployment definition for the existing Agent:

```yaml
environment:
  DD_APM_ENABLED: "true"
  DD_LOGS_ENABLED: "true"
  DD_DOGSTATSD_SOCKET: /var/run/datadog/dsd.socket
volumes:
  - /var/run/datadog:/var/run/datadog
  - /var/run/docker.sock:/var/run/docker.sock:ro
  - /var/lib/docker/containers:/var/lib/docker/containers:ro
  - ./openmetrics.yaml:/etc/datadog-agent/conf.d/openmetrics.d/aideep.yaml:ro
```

The OpenMetrics endpoint uses the current Docker bridge gateway `172.17.0.1`
and host-network application port `3320`. Update it if the gateway or app port
changes. Metrics are restricted to HTTP, WebSocket, Node.js and process metrics.
The app's `com.datadoghq.ad.logs` label selects its console logs for collection.

Live changes to `/etc/datadog-agent/datadog-docker.yaml` and files copied into
the Agent survive a restart, but must be added to the Agent's deployment definition
or bind mounts to survive container recreation. Its deployment definition is
outside this repository.

## Verification and rollback

Send an ordinary API request, then check `docker exec dd-agent agent status`:
APM should show received traces, OpenMetrics should show successful checks,
and Logs Agent should show the `aideep-app` source with submitted logs.
In Datadog, filter APM and Logs by `service:aideep-backend env:prod`;
metrics use the `aideep.*` and `runtime.node.*` namespaces.

Set `DD_TRACE_ENABLED=false` and recreate the app to disable tracing.
Deploy the previous image tag to roll back the application.

References: [Node.js tracing](https://docs.datadoghq.com/tracing/trace_collection/dd_libraries/nodejs/),
[Winston log correlation](https://docs.datadoghq.com/tracing/other_telemetry/connect_logs_and_traces/nodejs/).
