"""Generate docs/aether-positioning-brief.pdf from the positioning brief content."""

from pathlib import Path

from fpdf import FPDF

OUT = Path(__file__).with_name("aether-positioning-brief.pdf")

REPLACEMENTS = {
    "\u2014": "-",  # em dash
    "\u2013": "-",  # en dash
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2022": "-",
    "\u00b7": "-",
    "\u2192": "->",
}


def ascii_safe(text: str) -> str:
    for src, dst in REPLACEMENTS.items():
        text = text.replace(src, dst)
    return text.encode("latin-1", "replace").decode("latin-1")


class BriefPDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(
            0,
            8,
            ascii_safe("Aether - Positioning Brief  |  vs Essembl  |  Jul 2026"),
            align="L",
        )
        self.ln(4)

    def footer(self):
        self.set_y(-14)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(140, 140, 140)
        self.cell(0, 8, str(self.page_no()), align="C")

    def h1(self, text: str):
        self.set_font("Helvetica", "B", 20)
        self.set_text_color(20, 20, 20)
        self.multi_cell(0, 9, ascii_safe(text))
        self.ln(2)

    def h2(self, text: str):
        self.ln(4)
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(20, 20, 20)
        self.multi_cell(0, 7, ascii_safe(text))
        self.ln(2)

    def h3(self, text: str):
        self.ln(2)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 6, ascii_safe(text))
        self.ln(1)

    def body(self, text: str):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5.5, ascii_safe(text))
        self.ln(1)

    def muted(self, text: str):
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(100, 100, 100)
        self.multi_cell(0, 5, ascii_safe(text))
        self.ln(1)

    def quote(self, text: str):
        text = ascii_safe(text)
        self.set_fill_color(245, 245, 243)
        self.set_draw_color(200, 190, 170)
        x = self.get_x()
        y = self.get_y()
        self.set_font("Helvetica", "I", 10)
        self.set_text_color(30, 30, 30)
        w = self.epw
        lines = self.multi_cell(w - 8, 5.5, text, dry_run=True, output="LINES")
        h = max(16, len(lines) * 5.5 + 8)
        if y + h > self.page_break_trigger:
            self.add_page()
            y = self.get_y()
        self.rect(x, y, w, h, style="DF")
        self.set_xy(x + 4, y + 4)
        self.multi_cell(w - 8, 5.5, text)
        self.set_y(y + h + 3)

    def bullets(self, items: list[str]):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        for item in items:
            self.set_x(self.l_margin)
            self.multi_cell(self.epw, 5.5, ascii_safe(f"-  {item}"))
        self.set_x(self.l_margin)
        self.ln(1)

    def table(
        self,
        headers: list[str],
        rows: list[list[str]],
        col_weights: list[float] | None = None,
    ):
        headers = [ascii_safe(h) for h in headers]
        rows = [[ascii_safe(c) for c in r] for r in rows]
        if col_weights is None:
            col_weights = [1] * len(headers)
        total = sum(col_weights)
        widths = [self.epw * (w / total) for w in col_weights]

        def row_height(cells: list[str], bold: bool = False) -> float:
            self.set_font("Helvetica", "B" if bold else "", 8)
            heights = []
            for cell, width in zip(cells, widths):
                lines = self.multi_cell(
                    width - 2, 4.2, cell, dry_run=True, output="LINES"
                )
                heights.append(len(lines) * 4.2 + 3)
            return max(heights)

        def draw_row(cells: list[str], bold: bool = False, fill: bool = False):
            h = row_height(cells, bold)
            if self.get_y() + h > self.page_break_trigger:
                self.add_page()
            x0 = self.l_margin
            y0 = self.get_y()
            self.set_font("Helvetica", "B" if bold else "", 8)
            self.set_text_color(20, 20, 20)
            if fill:
                self.set_fill_color(236, 234, 228)
            for i, (cell, width) in enumerate(zip(cells, widths)):
                x = x0 + sum(widths[:i])
                self.set_xy(x, y0)
                if fill:
                    self.rect(x, y0, width, h, style="F")
                self.set_xy(x + 1, y0 + 1.5)
                self.multi_cell(width - 2, 4.2, cell)
            self.set_draw_color(210, 210, 205)
            self.rect(x0, y0, self.epw, h)
            for i in range(1, len(widths)):
                x = x0 + sum(widths[:i])
                self.line(x, y0, x, y0 + h)
            self.set_xy(self.l_margin, y0 + h)

        draw_row(headers, bold=True, fill=True)
        for r in rows:
            draw_row(r)
        self.set_x(self.l_margin)
        self.ln(3)


def build() -> None:
    pdf = BriefPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()

    pdf.muted("Positioning brief  ·  Aether vs Essembl  ·  July 2026")
    pdf.h1("Aether — Positioning Brief")
    pdf.body(
        "Same category headline. Different job. Do not compete as another AI closet. "
        "Own the morning ritual that ends the decision — with the full look on your body."
    )

    pdf.h2("North-star line")
    pdf.quote(
        "Aether is the morning you stop choosing. Say where you are going. We dress "
        "the full look on your body — from what you already own, and what you buy "
        "without photographing a pile on the bed."
    )
    pdf.table(
        ["Pillar", "Meaning"],
        [
            ["On body", "Core proof — the look is dressed onto your photo"],
            ["One look", "Not a feed of 40 outfits"],
            ["Zero upload", "Moat when purchase sync ships"],
        ],
        [1, 3],
    )

    pdf.h2("Taglines (pick one primary)")
    pdf.table(
        ["Line", "Use"],
        [
            [
                "Dress without deciding (PRIMARY)",
                "Brand, landing, App Store subtitle, Today header",
            ],
            [
                "See yourself already dressed",
                "Ads / try-on demos (before → after on your photo)",
            ],
            [
                "Where are you going?",
                "Product ritual prompt — not a brand-name replacement",
            ],
            [
                "Your stylist. Your body. One look.",
                "Membership / high-stakes occasions",
            ],
        ],
        [1.4, 2],
    )

    pdf.h2("Anti-positioning vs Essembl")
    pdf.muted("Say the left column out loud in every pitch. Never lead with the right.")
    pdf.table(
        ["We are", "We are not", "Why it matters"],
        [
            [
                "A morning dress ritual",
                "A digital closet to manage",
                "Essembl wins organization; we win certainty",
            ],
            [
                "Full look on your photo",
                "Outfit tiles / flat recommendations",
                "Proof beats advice — try-on is our core, their roadmap",
            ],
            [
                "One suggestion for today",
                "A feed of endless AI outfits",
                "Premium = less choice, higher confidence",
            ],
            [
                "Voice: speak the day / swap a piece",
                "Upload / browse / critique homework",
                "Decision eradication, not wardrobe labor",
            ],
            [
                "Wardrobe fills from how you shop",
                "Photograph every garment on the bed",
                "Defensible moat — only if sync is real",
            ],
            [
                "High-stakes days done for you",
                "Viral AI fashion toy",
                "Different buyer, different price, different brand",
            ],
        ],
        [1.2, 1.2, 1.4],
    )

    pdf.h3("Their job (Essembl)")
    pdf.bullets(
        [
            "Organize what you own",
            "Suggest combinations",
            "Help you shop / Shopping Buddy",
            "Center of gravity: digital closet + advisor",
        ]
    )
    pdf.h3("Our job (Aether)")
    pdf.bullets(
        [
            "Ask where you are going",
            "Pick one weather-aware look",
            "Dress it on your body end-to-end",
            "Center of gravity: occasion → on-body proof",
        ]
    )

    pdf.h2("Feature kill-list")
    pdf.muted(
        "Kill or demote anything that makes us look like Essembl with nicer chrome."
    )
    pdf.table(
        ["Kill or demote", "Why", "Do instead"],
        [
            [
                "Closet-first home / wardrobe dashboard",
                "Trains users to manage, not decide less",
                "Today = only home: occasion → dress",
            ],
            [
                "Endless outfit feed / “40 looks for you”",
                "Commoditizes us vs Essembl",
                "One primary look + tap/voice swap",
            ],
            [
                "Manual bed-scan as the main path",
                "Their strength; our pain point",
                "Seed + change photo + commerce sync",
            ],
            [
                "Outfit critique / score my fit",
                "Advisor framing = their category",
                "Show the dressed photo; let them swap",
            ],
            [
                "3D Tripo/Meshy avatar theater",
                "Distracts from photoreal try-on that works",
                "fal full-look on real photo only",
            ],
            [
                "Shopping Buddy clone",
                "Head-on with their newest feature",
                "Later: gaps from real outfits, not chat shop",
            ],
            [
                "Purple AI / viral meme brand",
                "Undercuts premium",
                "Calm ceremonial brand: Dress without deciding",
            ],
            [
                "Fake commerce “Connected” badges",
                "Burns trust when sync is simulated",
                "Ship one real ingest or label Demo clearly",
            ],
        ],
        [1.3, 1.2, 1.3],
    )

    pdf.h2("15-second demo — ship this first")
    pdf.quote(
        "Wedge test: If a stranger cannot feel the difference from Essembl in "
        "15 seconds, the build is wrong — not the marketing."
    )
    pdf.h3("Demo script (exact)")
    pdf.bullets(
        [
            "Open Today — “Where are you going?” Tap “meeting the in-laws” (or speak it).",
            "Watch the full look dress onto YOUR photo: top + trousers + shoes + glasses + watch — head to toe, no waist-up zoom.",
            "Say or tap “change the shoes.” Piece swaps on the same body. Done.",
        ]
    )
    pdf.h3("Ship order (next 2–4 weeks)")
    pdf.table(
        ["Priority", "Ship", "Must-pass test"],
        [
            [
                "P0",
                "Reliable full-body try-on (clothes + shoes visible)",
                "Feet in frame; loafers/boots readable on body",
            ],
            [
                "P0",
                "Today ritual only — occasion chips + voice",
                "No wardrobe tab required for first success",
            ],
            [
                "P0",
                "Change photo + re-dress without identity swap",
                "Still you at the end; framing preserved",
            ],
            [
                "P1",
                "Voice swap for one category (shoes / top)",
                "Works without typing in 15s demo",
            ],
            [
                "P1",
                "Honest commerce: one real path OR “Demo sync”",
                "Never fake “Connected to Amazon”",
            ],
            [
                "P2",
                "Membership: high-stakes days / unlimited dress",
                "Pay for certainty, not “AI credits” cosplay",
            ],
            [
                "Later",
                "True purchase ingest (1 retailer deep)",
                "New buy appears in wardrobe without photo",
            ],
        ],
        [0.7, 1.8, 1.7],
    )

    pdf.h2("Premium competitive posture")
    pdf.h3("Win on")
    pdf.bullets(
        [
            "Certainty for high-stakes mornings",
            "On-body proof, not outfit advice",
            "Ceremony + taste (old-money calm)",
            "Less UI, one job, voice-native",
        ]
    )
    pdf.h3("Concede")
    pdf.bullets(
        [
            "Viral reach / content machine",
            "Closet digitization depth (for now)",
            "Shopping Buddy / browse-to-buy chat",
            "Mass “AI stylist for everyone” volume",
        ]
    )
    pdf.h3("Pricing posture")
    pdf.body(
        "Do not race Essembl’s cheap unlimited AI. Price as a personal dress ritual "
        "for people who hate deciding — weekly or monthly for unlimited on-body looks "
        "and voice restyle. Free tier: one dressed look / day so the wedge is felt "
        "before paywall."
    )

    pdf.h2("One-sentence strategy")
    pdf.body(
        "Essembl proved people want AI help with clothes. Aether wins by making help "
        "feel finished — the look is already on you — then locking that with a wardrobe "
        "that fills itself from shopping, not from homework."
    )
    pdf.ln(4)
    pdf.muted(
        "Sources: Essembl App Store / essembl.com / public interviews · Aether product thesis · Jul 2026"
    )

    pdf.output(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
