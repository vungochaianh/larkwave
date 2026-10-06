import { deriveCategory, deriveSeoTitle, deriveSeoDescription, deriveTags, stripMarkdown } from '@larkwave/shared';

/**
 * Bài blog tự đăng đi thẳng ra site công khai, không ai đọc lại trước khi lên. Nên hỏng ở đây là
 * loại hỏng im lặng: trang vẫn hiện, vẫn có thẻ meta, chỉ là nội dung thẻ vô dụng.
 *
 * Ba thứ canh ở đây:
 *  (a) tiêu đề/mô tả VƯỢT ngưỡng Google cắt → mất từ khoá ở đuôi, và mất luôn tên thương hiệu.
 *  (b) cắt giữa chừng một TỪ → mô tả đọc như bị lỗi, giảm tỉ lệ nhấp.
 *  (c) thẻ toàn hư từ ("của", "the") → mọi bài dính chung một thẻ, liên kết nội bộ thành vô nghĩa.
 */
describe('blog-seo', () => {
  describe('deriveSeoTitle', () => {
    it('thêm đuôi thương hiệu khi còn chỗ', () => {
      expect(deriveSeoTitle('Cách tạo web app bằng AI')).toBe('Cách tạo web app bằng AI · Larkwave');
    });

    it('bỏ đuôi thương hiệu thay vì nhồi rồi bị cắt', () => {
      const long = 'Hướng dẫn đầy đủ cách dựng một ứng dụng web full-stack chỉ bằng một câu mô tả';
      const out = deriveSeoTitle(long);
      expect(out.length).toBeLessThanOrEqual(60);
      expect(out).not.toContain('Larkwave');
      expect(out.endsWith('…')).toBe(true);
    });

    it('cắt ở ranh giới từ với tiêu đề bình thường', () => {
      const out = deriveSeoTitle('Hướng dẫn dựng ứng dụng web full-stack bằng AI cho người mới bắt đầu hoàn toàn');
      expect(out.length).toBeLessThanOrEqual(60);
      // bỏ dấu … rồi phải còn là một từ trọn vẹn
      expect(out.replace(/…$/, '').endsWith(' ')).toBe(false);
      expect(out).toMatch(/\S…$/);
    });

    it('ĐÁNH ĐỔI: một "từ" dài bất thường (URL dán vào) thì cắt CỨNG', () => {
      // Ranh giới từ gần nhất nằm quá sớm (ký tự 20/60); lùi về đó là vứt hai phần ba tiêu đề.
      // Thà cắt giữa khối ký tự vô nghiĩa đó còn hơn trả về một tiêu đề cụt lủn.
      const out = deriveSeoTitle('a'.repeat(20) + ' ' + 'b'.repeat(70));
      expect(out.length).toBeLessThanOrEqual(60);
      expect(out.length).toBeGreaterThan(40);
    });

    it('tiêu đề rỗng vẫn ra thương hiệu chứ không ra chuỗi rỗng', () => {
      expect(deriveSeoTitle('   ')).toBe('Larkwave');
    });
  });

  describe('deriveSeoDescription', () => {
    it('ưu tiên caption hơn thân bài', () => {
      expect(deriveSeoDescription('Tóm tắt ngắn gọn.', '# Tiêu đề\n\nThân bài dài.')).toBe('Tóm tắt ngắn gọn.');
    });

    it('caption rỗng thì rút từ thân bài, đã bỏ cú pháp Markdown', () => {
      const out = deriveSeoDescription('', '# Tiêu đề\n\n![ảnh](a.png)\n\nNội dung **thật** ở đây.');
      expect(out).toBe('Tiêu đề Nội dung thật ở đây.');
    });

    it('không vượt 155 ký tự và không cắt giữa từ', () => {
      const out = deriveSeoDescription('', 'từ '.repeat(200));
      expect(out.length).toBeLessThanOrEqual(155);
      expect(out.endsWith('…')).toBe(true);
    });

    it('không có gì thì trả chuỗi rỗng, để generateMetadata tự lùi về excerpt', () => {
      expect(deriveSeoDescription('', '')).toBe('');
    });
  });

  describe('stripMarkdown', () => {
    it('bỏ khối code, ảnh, tiêu đề; giữ chữ trong link', () => {
      const md = '# H1\n\n```js\nconst x = 1;\n```\n\n![alt](i.png) xem [tài liệu](https://a.b) nhé';
      expect(stripMarkdown(md)).toBe('H1 xem tài liệu nhé');
    });
  });

  describe('deriveTags', () => {
    /**
     * Ca này lấy từ BÀI THẬT đầu tiên chạy trên máy chủ. Nó ra
     * ["howto","cách","tạo","website","bán","hàng"] — bốn trong sáu thẻ là chữ cắt rời khỏi câu.
     * Vì listPublished lọc theo thẻ, mỗi chữ vụn đó đẻ ra một trang danh sách rỗng nghĩa.
     */
    it('KHÔNG lấy động từ / danh từ chung chung làm thẻ', () => {
      const tags = deriveTags('Cách tạo website bán hàng online không cần biết lập trình', '', 'howto');
      for (const junk of ['cách', 'tạo', 'bán', 'hàng', 'không', 'cần', 'biết']) {
        expect(tags).not.toContain(junk);
      }
      expect(tags).toContain('website');
    });

    it('loại hư từ và không lặp', () => {
      const tags = deriveTags('công cụ của các website và website', 'website');
      expect(tags).not.toContain('của');
      expect(tags).not.toContain('và');
      expect(new Set(tags).size).toBe(tags.length);
    });

    it('template đứng đầu, và tôn trọng giới hạn', () => {
      const tags = deriveTags('alpha bravo charlie delta echo foxtrot', '', 'howto', 4);
      expect(tags[0]).toBe('howto');
      expect(tags).toHaveLength(4);
    });

    it('bỏ từ dưới 4 ký tự — thường là mảnh của một từ ghép', () => {
      expect(deriveTags('AI ml web', '')).toEqual([]);
    });

    it('thẻ NGƯỜI chỉ định thì dùng nguyên, kể cả cụm nhiều chữ', () => {
      const tags = deriveTags('bỏ qua', 'bỏ qua', 'howto', 5, ['website bán hàng', 'thương mại điện tử']);
      expect(tags).toEqual(['howto', 'website bán hàng', 'thương mại điện tử']);
    });

    it('có thẻ chỉ định thì KHÔNG trộn thêm từ tự đoán', () => {
      const tags = deriveTags('một câu dài đầy những từ có thể thành thẻ vụn', '', undefined, 5, ['seo']);
      expect(tags).toEqual(['seo']);
    });
  });
});

describe('deriveCategory: chuyên mục gom đúng, không vỡ vụn', () => {
  it('bài về DNS/tên miền KHÔNG rơi vào mục Website chung chung', () => {
    // Bài nào cũng nhắc "website"; nếu luật rộng đứng trước thì mọi bài dồn vào một mục và tab
    // chuyên mục trở nên vô dụng. Đây là ca canh đúng thứ tự luật.
    expect(deriveCategory('', 'Cách đưa website lên mạng với tên miền riêng')).toBe('Tên miền & hosting');
  });

  it('gom đúng các chủ đề chính', () => {
    expect(deriveCategory('', 'Cách tạo website bán hàng online không cần code')).toBe('Bán hàng online');
    expect(deriveCategory('', 'Tự động hoá Lark Base cho tiệm cắt tóc')).toBe('Tự động hoá');
    expect(deriveCategory('', 'Chi phí thật khi thuê người làm website')).toBe('Chi phí & so sánh');
    expect(deriveCategory('', 'Trợ lý AI viết nội dung cho shop')).toBe('AI & trợ lý');
  });

  it('không khớp luật nào thì vẫn CÓ mục, không để trống', () => {
    // Bài không có mục sẽ biến mất khỏi mọi tab — tệ hơn là xếp nhầm mục.
    expect(deriveCategory('', 'Vài suy nghĩ vụn vặt')).toBe('Hướng dẫn');
    expect(deriveCategory('', '')).toBe('Hướng dẫn');
  });

  it('chủ đề của lịch được tính cùng tiêu đề', () => {
    expect(deriveCategory('bán hàng online', 'Bắt đầu từ đâu')).toBe('Bán hàng online');
  });
});

describe('deriveCategory: khoá ngắn phải khớp theo ranh giới từ', () => {
  it('"ai" KHÔNG được khớp bên trong "phải", "ngoài", "loại"', () => {
    // Bẫy thật: rất nhiều từ tiếng Việt chứa chuỗi "ai". Dùng includes() thì gần như mọi bài rơi
    // vào mục AI, và nó sai ÂM THẦM — không có lỗi nào để mà thấy.
    expect(deriveCategory('', 'Những thứ bạn phải làm trước khi mở shop')).not.toBe('AI & trợ lý');
    expect(deriveCategory('', 'Ngoài giao diện còn cần gì cho trang web')).not.toBe('AI & trợ lý');
    expect(deriveCategory('', 'Các loại hosting phổ biến')).toBe('Tên miền & hosting');
  });

  it('"AI" đứng riêng thì vẫn khớp', () => {
    expect(deriveCategory('', 'Dùng AI để viết bài chuẩn SEO')).toBe('AI & trợ lý');
  });

  it('đối tượng không phải chủ đề: "cho shop" không biến bài AI thành bài bán hàng', () => {
    expect(deriveCategory('', 'Trợ lý AI viết nội dung cho shop')).toBe('AI & trợ lý');
  });
});

describe('deriveCategory: ca thật trên blog đang chạy', () => {
  it('bài so sánh chi phí có nhắc AI vẫn là bài CHI PHÍ', () => {
    // Đo trên bài thật: AI ở đây là một VẾ được đem so, không phải chủ đề.
    expect(deriveCategory('', 'Chi phí thật khi thuê người làm website so với tự dựng bằng AI'))
      .toBe('Chi phí & so sánh');
  });

  it('"web" đứng riêng cũng là bài Website, không rơi vào mục mặc định', () => {
    expect(deriveCategory('', 'Web tĩnh và web có cơ sở dữ liệu khác nhau ra sao, khi nào cần cái nào'))
      .toBe('Website');
  });
});
