// 串流代理：把 Google Drive 檔案以同源方式餵給瀏覽器，供前端渲染 PDF 頁面
export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const view = url.searchParams.get('view'); // view=pdf → 瀏覽器直接內嵌顯示

  if (!id) {
    return new Response('missing id', { status: 400 });
  }

  try {
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${id}&confirm=t`;
    const driveRes = await fetch(downloadUrl, { redirect: 'follow' });

    if (!driveRes.ok) {
      return new Response('download failed', { status: 502 });
    }

    const contentType = driveRes.headers.get('content-type') || 'application/octet-stream';
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
    return new Response(`error: ${err.message}`, { status: 500 });
  }
};
