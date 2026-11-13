window.SITE = {
  "title": "My Home",
  "name": "Name",
  "desc": "Info",
  "avatar": "images/avatar.svg",
  "header": "images/header.svg",
  "footerName": "My Home",
  "highlight": "#b1c98d",
  "musicId": "",
  "musicIcon": "♪",
  "bannerLink": "",
  "pages": [
    {
      "id": "home",
      "label": "Home",
      "menu": false,
      "html": "<section class=\"cover\"><img src=\"images/main.svg\" alt=\"\" class=\"cover-image\"><div class=\"content-box\"><p>제일 먼저 나오는 페이지입니다.</p><p>주소 뒤에 #admin 을 붙여 들어가면 내용을 고칠 수 있습니다.</p></div></section>"
    },
    {
      "id": "notice",
      "label": "Notice",
      "menu": true,
      "html": "<div class=\"notice-box\"><div class=\"notice-title\">Notice</div><div class=\"notice-content\"><h2>제목입니다</h2><p>이것은 문단입니다. 여러 문장을 담을 수 있습니다.</p><p>이건 <strong>굵은 글씨</strong>, 이건 <em>기울임</em>, 이건 <u>밑줄</u>, 이건 <s>취소선</s>입니다.</p><blockquote>여기에는 인용문이 들어갑니다.</blockquote><p><span class=\"highlight-text\">포인트 색으로 강조한 글씨</span>입니다.</p><hr class=\"notice-divider\"></div></div><details class=\"blocked-box\"><summary>List</summary><ul><li>요소 1</li><li>요소 2</li><li>요소 3</li></ul></details>"
    },
    {
      "id": "about",
      "label": "About",
      "menu": true,
      "html": "<div class=\"content-box\"><p>소개 글을 적어 보세요.</p></div>"
    }
  ],
  "socials": [
    { "label": "Twitter", "url": "https://x.com/" }
  ],
  "myBanners": [
    { "img": "images/banner1.svg" }
  ],
  "extBanners": [
    { "img": "images/banner2.svg", "url": "" }
  ],
  "admin": {
    "email": "ibgh0906@gmail.com"
  },
  "firebase": {
    "apiKey": "AIzaSyCI0h8-xDaKkqCNiWjQDij0j9eZ22Wu9c8",
    "authDomain": "kahihome.firebaseapp.com",
    "projectId": "kahihome",
    "storageBucket": "kahihome.firebasestorage.app",
    "messagingSenderId": "916648866480",
    "appId": "1:916648866480:web:efe614839d6bccb0440175"
  }
};
