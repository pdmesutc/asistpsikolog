<?php
/**
 * AsistPsikolog - NetGSM API Köprü Dosyası (netgsm-api.php)
 * CORS engellerini aşar, onaylı SMS başlığını otomatik algılar ve İYS filtresiz (Bilgilendirme) SMS gönderir.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Varsayılan NetGSM API Bilgileri
$DEFAULT_USERCODE  = '8503098249';
$DEFAULT_PASSWORD  = 'D.aY75sk';
$DEFAULT_MSGHEADER = '8503098249';

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

if (!is_array($data)) {
    echo json_encode([
        'basarili' => false,
        'kod'      => 'ERR_JSON',
        'mesaj'    => 'Geçersiz veri formatı gönderildi.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$action    = isset($data['action']) ? trim($data['action']) : 'send_sms';
$usercode  = !empty($data['usercode']) ? trim($data['usercode']) : $DEFAULT_USERCODE;
$password  = !empty($data['password']) ? trim($data['password']) : $DEFAULT_PASSWORD;
$msgheader = !empty($data['msgheader']) ? trim($data['msgheader']) : $DEFAULT_MSGHEADER;

/**
 * NetGSM'den hesaba tanımlı onaylı başlıkları (Gönderici Adlarını) çeker
 */
function netgsmBasliklariGetir($usercode, $password) {
    $url = "https://api.netgsm.com.tr/sms/header?usercode=" . urlencode($usercode) . "&password=" . urlencode($password);
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    $resp = curl_exec($ch);
    curl_close($ch);

    if ($resp === false) return [];
    $resp = trim($resp);
    // Hata kodları: 30 (Yetkisiz), 40 (Başlık yok) vb.
    if (in_array($resp, ['20', '30', '40', '50', '60', '70', '80'])) {
        return [];
    }
    $satirlar = preg_split('/\r\n|\r|\n|<br>|<br\/>/i', $resp);
    $basliklar = [];
    foreach ($satirlar as $s) {
        $temiz = trim($s);
        if ($temiz !== '') {
            $basliklar[] = $temiz;
        }
    }
    return $basliklar;
}

/**
 * NetGSM XML API üzerinden çoklu / tekli SMS gönderir
 */
function netgsmXmlSmsGonder($usercode, $password, $msgheader, $mesajlar) {
    $xmlBody = '';
    foreach ($mesajlar as $m) {
        $tel = preg_replace('/\D/', '', isset($m['tel']) ? $m['tel'] : '');
        if (strlen($tel) === 12 && substr($tel, 0, 2) === '90') {
            $tel = substr($tel, 2);
        } elseif (strlen($tel) === 11 && substr($tel, 0, 1) === '0') {
            $tel = substr($tel, 1);
        }
        $metin = isset($m['msg']) ? trim($m['msg']) : '';
        if (strlen($tel) === 10 && $metin !== '') {
            // CDATA güvenliği
            $metinSafe = str_replace(']]>', ']]]]><![CDATA[>', $metin);
            $xmlBody .= "<mp><msg><![CDATA[{$metinSafe}]]></msg><no>{$tel}</no></mp>";
        }
    }

    if ($xmlBody === '') {
        return ['raw' => 'ERR_NO_VALID_PHONE', 'kod' => 'ERR_NO_VALID_PHONE'];
    }

    $xml = '<?xml version="1.0" encoding="UTF-8"?>' .
           '<mainbody>' .
               '<header>' .
                   '<company dil="TR">Netgsm</company>' .
                   '<usercode>' . htmlspecialchars($usercode, ENT_XML1, 'UTF-8') . '</usercode>' .
                   '<password>' . htmlspecialchars($password, ENT_XML1, 'UTF-8') . '</password>' .
                   '<type>n:n</type>' .
                   '<msgheader>' . htmlspecialchars($msgheader, ENT_XML1, 'UTF-8') . '</msgheader>' .
                   '<iysfilter>0</iysfilter>' .
               '</header>' .
               '<body>' . $xmlBody . '</body>' .
           '</mainbody>';

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, "https://api.netgsm.com.tr/sms/send/xml");
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, 0);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Content-Type: text/xml; charset=UTF-8"]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $xml);
    $result = curl_exec($ch);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($result === false) {
        return ['raw' => $curlErr, 'kod' => 'CURL_ERROR'];
    }

    $resultTrim = trim($result);
    $parcalar = explode(' ', $resultTrim);
    $ilkKod = $parcalar[0];

    return [
        'raw' => $resultTrim,
        'kod' => $ilkKod
    ];
}

/**
 * NetGSM hata kodlarının Türkçe açıklamaları
 */
function netgsmKodAciklamasi($kod, $raw) {
    $harita = [
        '00' => 'SMS başarıyla gönderildi.',
        '01' => 'SMS gönderildi (Başlangıç tarihi hatalıydı, sistem tarihine güncellendi).',
        '02' => 'SMS gönderildi (Bitiş tarihi hatalıydı, sistem tarihine güncellendi).',
        '20' => 'Mesaj metninde hata var veya maksimum karakter sınırı aşıldı.',
        '30' => 'Geçersiz kullanıcı adı, şifre veya API erişim izniniz / IP yetkiniz kapalı.',
        '40' => 'Gönderici adı (SMS Başlığı) NetGSM sisteminde onaylı değil.',
        '50' => 'Abone hesabınız ile İYS kontrollü gönderim yapılamamaktadır.',
        '51' => 'Aboneliğinize tanımlı İYS Marka bilgisi bulunamadı.',
        '70' => 'Hatalı sorgulama. Gönderilen parametrelerden biri eksik veya hatalı.',
        '80' => 'Gönderim sınır aşımı.',
        '85' => 'Mükerrer gönderim sınır aşımı (Aynı numaraya 1 dakikada 20\'den fazla mesaj).'
    ];
    return isset($harita[$kod]) ? $harita[$kod] : ("NetGSM Yanıtı: " . $raw);
}

// 1. ONAYLI BAŞLIKLARI SORGULAMA İSTEĞİ
if ($action === 'get_headers') {
    $basliklar = netgsmBasliklariGetir($usercode, $password);
    if (count($basliklar) > 0) {
        echo json_encode([
            'basarili'  => true,
            'basliklar' => $basliklar,
            'mesaj'     => 'Onaylı SMS başlıkları başarıyla çekildi.'
        ], JSON_UNESCAPED_UNICODE);
    } else {
        echo json_encode([
            'basarili'  => false,
            'basliklar' => [],
            'mesaj'     => 'Onaylı başlık bulunamadı veya API kullanıcı adı/şifre/IP yetkisi hatalı (Kod 30/40).'
        ], JSON_UNESCAPED_UNICODE);
    }
    exit;
}

// 2. SMS GÖNDERME İSTEĞİ
if ($action === 'send_sms') {
    $mesajlar = isset($data['messages']) && is_array($data['messages']) ? $data['messages'] : [];
    if (count($mesajlar) === 0) {
        echo json_encode([
            'basarili' => false,
            'kod'      => 'EMPTY',
            'mesaj'    => 'Gönderilecek telefon numarası veya mesaj bulunamadı.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $sonuc = netgsmXmlSmsGonder($usercode, $password, $msgheader, $mesajlar);

    // Eğer 40 (Başlık onaylı değil) hatası dönerse, hesaptaki ilk onaylı başlığı otomatik bulup tekrar dene!
    if ($sonuc['kod'] === '40') {
        $onayliBasliklar = netgsmBasliklariGetir($usercode, $password);
        if (count($onayliBasliklar) > 0) {
            $msgheader = $onayliBasliklar[0];
            $sonuc = netgsmXmlSmsGonder($usercode, $password, $msgheader, $mesajlar);
        }
    }

    $basariliMi = in_array($sonuc['kod'], ['00', '01', '02']) || (strlen($sonuc['raw']) > 5 && is_numeric($sonuc['kod']) && intval($sonuc['kod']) > 100);

    echo json_encode([
        'basarili'         => $basariliMi,
        'kod'              => $sonuc['kod'],
        'detay'            => $sonuc['raw'],
        'kullanilanBaslik' => $msgheader,
        'mesaj'            => netgsmKodAciklamasi($sonuc['kod'], $sonuc['raw'])
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode([
    'basarili' => false,
    'kod'      => 'UNKNOWN_ACTION',
    'mesaj'    => 'Bilinmeyen işlem türü.'
], JSON_UNESCAPED_UNICODE);