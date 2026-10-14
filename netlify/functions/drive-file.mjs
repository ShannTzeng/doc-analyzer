// 串流代理：把 Google Drive 檔案以同源方式餵給瀏覽器，供前端渲染 PDF 頁面
export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const view = url.searchParams.get('view'); // view=pdf → 瀏覽器直接內嵌顯示
  const probe = url.searchParams.get('probe') === '1'; // probe=1 → 只回報檔案大小，不下載內容

  const JSON_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };

  if (!id) {
    return probe
      ? new Response(JSON.stringify({ size: null, accessible: false, error: 'missing id' }), { status: 400, headers: JSON_HEADERS })
      : new Response('missing id', { status: 400 });
  }

  try {
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${id}&confirm=t`;
    const driveRes = await fetch(downloadUrl, { redirect: 'follow' });

    if (!driveRes.ok) {
      if (probe) {
        try { if (driveRes.body) await driveRes.body.cancel(); } catch (_) {}
        return new Response(JSON.stringify({ size: null, accessible: false, error: `HTTP ${driveRes.status}` }), { status: 200, headers: JSON_HEADERS });
      }
      return new Response('download failed', { status: 502 });
    }

    const contentType = driveRes.headers.get('content-type') || 'application/octet-stream';

    // 探測模式：讀完標頭就中止下載，只回傳大小與可存取狀態
    if (probe) {
      const lenRaw = driveRes.headers.get('content-length');
      const accessible = !contentType.includes('text/html');
      try { if (driveRes.body) await driveRes.body.cancel(); } catch (_) {}
      return new Response(JSON.stringify({
        size: lenRaw ? Number(lenRaw) : null,
        contentType,
        accessible,
        error: accessible ? null : '檔案無法存取，請確認分享設定',
      }), { status: 200, headers: JSON_HEADERS });
    }

    if (contentType.includes('text/html')) {
      return new Response('file not accessible', { status: 403 });
    }

    // view=pdf：強制以 PDF 內嵌顯示（供頁碼連結在新分頁開啟、跳頁）
    const outType = view === 'pdf' ? 'application/pdf' : contentType;

    // 直接把上游串流回傳，避免緩衝整個大檔、也避開同步回應大小限制
    return new Response(driveRes.body, {
      status: 200,
      headers: {
        'Content-Type': outType,
        // inline 讓瀏覽器直接開啟顯示，而不是下載
        'Content-Disposition': 'inline',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return probe
      ? new Response(JSON.stringify({ size: null, accessible: false, error: err.message }), { status: 200, headers: JSON_HEADERS })
      : new Response(`error: ${err.message}`, { status: 500 });
  }
};
