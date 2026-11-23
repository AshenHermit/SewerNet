const addresses = ["{$SITE_HOST}:80","{$APP_HOST}:80",":80"];
console.log("String 0:", JSON.stringify(addresses[0]));
console.log("String 1:", JSON.stringify(addresses[1]));
const filtered = addresses.filter(a => a.startsWith("http://") || a.startsWith("https://") || /^[{}\w$.-]+:\d+$/.test(a));
console.log("Filtered:", JSON.stringify(filtered));
console.log("Length:", filtered.length);