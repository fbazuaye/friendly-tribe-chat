import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Base64URL decode
function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createVapidAuthHeader(
  endpoint: string,
  subject: string,
  publicKeyBase64: string,
  privateKeyBase64: string
): Promise<{ authorization: string; cryptoKey: string }> {
  const audience = new URL(endpoint).origin;

  // Import the private key
  const privateKeyBytes = base64UrlDecode(privateKeyBase64);
  const publicKeyBytes = base64UrlDecode(publicKeyBase64);

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: privateKeyBase64,
      x: base64UrlEncode(publicKeyBytes.slice(1, 33)),
      y: base64UrlEncode(publicKeyBytes.slice(33, 65)),
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Create JWT
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: subject,
  };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw r||s format
  const sigBytes = new Uint8Array(signature);
  let r: Uint8Array, s: Uint8Array;
  
  if (sigBytes.length === 64) {
    r = sigBytes.slice(0, 32);
    s = sigBytes.slice(32);
  } else {
    // DER encoded
    let offset = 2;
    const rLen = sigBytes[offset + 1];
    r = sigBytes.slice(offset + 2, offset + 2 + rLen);
    offset = offset + 2 + rLen;
    const sLen = sigBytes[offset + 1];
    s = sigBytes.slice(offset + 2, offset + 2 + sLen);
    
    // Pad or trim to 32 bytes
    if (r.length > 32) r = r.slice(r.length - 32);
    if (s.length > 32) s = s.slice(s.length - 32);
    if (r.length < 32) { const tmp = new Uint8Array(32); tmp.set(r, 32 - r.length); r = tmp; }
    if (s.length < 32) { const tmp = new Uint8Array(32); tmp.set(s, 32 - s.length); s = tmp; }
  }

  const rawSig = new Uint8Array(64);
  rawSig.set(r, 0);
  rawSig.set(s, 32);

  const jwt = `${unsignedToken}.${base64UrlEncode(rawSig)}`;

  return {
    authorization: `vapid t=${jwt}, k=${publicKeyBase64}`,
    cryptoKey: `p256ecdsa=${publicKeyBase64}`,
  };
}

// Web Push encryption (RFC 8291)
async function encryptPayload(
  payload: string,
  subscriptionPublicKey: string,
  subscriptionAuth: string
): Promise<{ encrypted: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const clientPublicKeyBytes = base64UrlDecode(subscriptionPublicKey);
  const authSecret = base64UrlDecode(subscriptionAuth);

  // Generate server key pair
  const serverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const serverPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));

  // Import client public key
  const clientKey = await crypto.subtle.importKey(
    'raw',
    clientPublicKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: clientKey },
      serverKeys.privateKey,
      256
    )
  );

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF for IKM
  const authInfo = new TextEncoder().encode('WebPush: info\0');
  const authInfoFull = new Uint8Array(authInfo.length + clientPublicKeyBytes.length + serverPublicKey.length);
  authInfoFull.set(authInfo);
  authInfoFull.set(clientPublicKeyBytes, authInfo.length);
  authInfoFull.set(serverPublicKey, authInfo.length + clientPublicKeyBytes.length);

  const prkKey = await crypto.subtle.importKey('raw', sharedSecret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, authSecret));

  const ikmKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const ikm = new Uint8Array(await crypto.subtle.sign('HMAC', ikmKey, new Uint8Array([...authInfoFull, 1])));

  // HKDF for CEK and nonce
  const saltKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prkCek = new Uint8Array(await crypto.subtle.sign('HMAC', saltKey, ikm));

  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cekKey = await crypto.subtle.importKey('raw', prkCek, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const cekFull = new Uint8Array(await crypto.subtle.sign('HMAC', cekKey, new Uint8Array([...cekInfo, 1])));
  const cek = cekFull.slice(0, 16);

  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonceKey = await crypto.subtle.importKey('raw', prkCek, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const nonceFull = new Uint8Array(await crypto.subtle.sign('HMAC', nonceKey, new Uint8Array([...nonceInfo, 1])));
  const nonce = nonceFull.slice(0, 12);

  // Encrypt with AES-128-GCM
  const paddedPayload = new Uint8Array([...new TextEncoder().encode(payload), 2]); // Add delimiter
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, paddedPayload));

  // Build aes128gcm content
  const recordSize = encrypted.length + 86;
  const header = new Uint8Array(86);
  header.set(salt, 0); // 16 bytes salt
  header[16] = (recordSize >> 24) & 0xff;
  header[17] = (recordSize >> 16) & 0xff;
  header[18] = (recordSize >> 8) & 0xff;
  header[19] = recordSize & 0xff;
  header[20] = 65; // key length
  header.set(serverPublicKey, 21); // 65 bytes key

  const body = new Uint8Array(header.length + encrypted.length);
  body.set(header);
  body.set(encrypted, header.length);

  return { encrypted: body, salt, serverPublicKey };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, record } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:noreply@example.com';

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured');
      return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let recipientUserIds: string[] = [];
    let title = 'New message';
    let body = '';
    let url = '/';
    let tag = '';

    if (type === 'message') {
      // Direct message: notify all participants except sender
      const { data: participants } = await supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', record.conversation_id)
        .neq('user_id', record.sender_id);

      recipientUserIds = (participants || []).map((p: any) => p.user_id);

      // Get sender name
      const { data: sender } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', record.sender_id)
        .single();

      title = sender?.display_name || 'New message';
      body = (record.content || '').slice(0, 100);
      url = `/chat/${record.conversation_id}`;
      tag = record.conversation_id;
    } else if (type === 'broadcast') {
      // Broadcast: notify all subscribers except sender
      const { data: subscribers } = await supabase
        .from('broadcast_subscribers')
        .select('user_id')
        .eq('channel_id', record.channel_id)
        .neq('user_id', record.sender_id);

      recipientUserIds = (subscribers || []).map((s: any) => s.user_id);

      const { data: channel } = await supabase
        .from('broadcast_channels')
        .select('name')
        .eq('id', record.channel_id)
        .single();

      title = channel?.name || 'Broadcast';
      body = (record.content || '').slice(0, 100);
      url = `/broadcasts/${record.channel_id}`;
      tag = `broadcast-${record.channel_id}`;
    }

    if (recipientUserIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get push subscriptions for recipients
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', recipientUserIds);

    if (!subscriptions?.length) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no subscriptions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = JSON.stringify({ title, body, url, tag });

    let sent = 0;
    let failed = 0;
    const expiredSubscriptionIds: string[] = [];

    for (const sub of subscriptions) {
      try {
        const vapidHeaders = await createVapidAuthHeader(
          sub.endpoint,
          vapidSubject,
          vapidPublicKey,
          vapidPrivateKey
        );

        const { encrypted } = await encryptPayload(payload, sub.p256dh, sub.auth);

        const response = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Encoding': 'aes128gcm',
            'TTL': '86400',
            'Authorization': vapidHeaders.authorization,
            'Urgency': 'high',
          },
          body: encrypted,
        });

        if (response.status === 201 || response.status === 200) {
          sent++;
        } else if (response.status === 404 || response.status === 410) {
          // Subscription expired, mark for deletion
          expiredSubscriptionIds.push(sub.id);
          failed++;
        } else {
          const respText = await response.text();
          console.error(`Push failed for ${sub.endpoint}: ${response.status} ${respText}`);
          failed++;
        }
      } catch (err) {
        console.error(`Push error for ${sub.endpoint}:`, err);
        failed++;
      }
    }

    // Clean up expired subscriptions
    if (expiredSubscriptionIds.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('id', expiredSubscriptionIds);
    }

    return new Response(
      JSON.stringify({ sent, failed, expired: expiredSubscriptionIds.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Push notification error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
