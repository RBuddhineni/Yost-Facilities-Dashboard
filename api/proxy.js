export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url parameter" });
  let targetUrl;
  try {
    targetUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid url parameter" });
  }
  if (!targetUrl.hostname.endsWith("script.google.com")) {
    return res.status(403).json({ error: "Only script.google.com URLs are allowed" });
  }
  try {
    const response = await fetch(targetUrl.toString());
    const text = await response.text();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    res.status(response.status).send(text);
  } catch (err) {
    res.status(502).json({ error: `Proxy fetch failed: ${err.message}` });
  }
}
