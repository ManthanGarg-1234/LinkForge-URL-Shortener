
const BACKEND_URL = "https://linkforge-url-shortener-up2g.onrender.com";

export async function onRequest(context) {
  const { request, params } = context;
  const incomingUrl = new URL(request.url);

  const path = Array.isArray(params.path)
    ? params.path.join("/")
    : params.path || "";

  const targetUrl = new URL(
    `/api/${path}${incomingUrl.search}`,
    BACKEND_URL
  );

  const headers = new Headers(request.headers);
  headers.delete("host");

  const backendRequest = new Request(targetUrl, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method)
      ? undefined
      : request.body,
    redirect: "manual",
  });

  return fetch(backendRequest);
}
