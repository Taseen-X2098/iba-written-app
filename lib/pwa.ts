const PRODUCTION_SERVICE_WORKER = "/sw.js";
const DEVELOPMENT_SERVICE_WORKER = "/firebase-messaging-sw.js";

export function getAppServiceWorkerUrl() {
  return process.env.NODE_ENV === "production"
    ? PRODUCTION_SERVICE_WORKER
    : DEVELOPMENT_SERVICE_WORKER;
}

export function registerAppServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this browser");
  }

  return navigator.serviceWorker.register(getAppServiceWorkerUrl(), {
    scope: "/",
    updateViaCache: "none",
  });
}
