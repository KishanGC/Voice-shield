
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)


def generate_analysis_pdf(record: dict) -> BytesIO:
    buffer = BytesIO()

    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontSize=22,
        textColor=colors.HexColor("#17365D"),
        alignment=TA_CENTER,
        spaceAfter=8,
    )

    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#52647A"),
        alignment=TA_CENTER,
        spaceAfter=16,
    )

    heading_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontSize=12,
        textColor=colors.HexColor("#17365D"),
        spaceBefore=12,
        spaceAfter=7,
    )

    body_style = ParagraphStyle(
        "ReportBody",
        parent=styles["BodyText"],
        fontSize=9,
        leading=13,
        spaceAfter=7,
    )

    table_text_style = ParagraphStyle(
        "TableText",
        parent=styles["BodyText"],
        fontSize=8.5,
        leading=12,
    )

    story = []

    def safe_text(value):
        if value is None or str(value).strip() == "":
            return "Not available"
        return escape(str(value))

    def make_table(data, widths, header=True):
        converted_data = []

        for row_index, row in enumerate(data):
            converted_row = []

            for value in row:
                if header and row_index == 0:
                    converted_row.append(
                        Paragraph(
                            f"<b>{safe_text(value)}</b>",
                            table_text_style,
                        )
                    )
                else:
                    converted_row.append(
                        Paragraph(safe_text(value), table_text_style)
                    )

            converted_data.append(converted_row)

        table = Table(
            converted_data,
            colWidths=widths,
            repeatRows=1 if header else 0,
        )

        table_style = [
            ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#26364A")),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D2DCE8")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]

        if header:
            table_style.extend([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17365D")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ])

        table.setStyle(TableStyle(table_style))
        return table

    # Report heading
    story.append(Paragraph("VoiceShield AI", title_style))
    story.append(
        Paragraph(
            "AI-Powered Voice Cloning Detection and Analysis Report",
            subtitle_style,
        )
    )

    story.append(HRFlowable(
        width="100%",
        thickness=1,
        color=colors.HexColor("#9BAFC8"),
    ))
    story.append(Spacer(1, 10))

    # 1. Analysis information
    story.append(
        Paragraph("1. Analysis Information", heading_style)
    )

    information = [
        ["Report ID", record.get("id", "Not available")],
        ["Audio Filename", record.get("filename", "Not available")],
        ["Analysis Date (UTC)", record.get("created_at", "Not available")],
        ["Detection System", "VoiceShield AI"],
    ]

    story.append(make_table(
        information,
        [50 * mm, 110 * mm],
        header=False,
    ))

    # 2. Speech transcription
    story.append(
        Paragraph("2. Speech Transcription", heading_style)
    )

    transcript = safe_text(record.get("transcript"))
    language = safe_text(record.get("language_code"))

    transcription_data = [
        ["Parameter", "Result"],
        ["Detected Language", language],
        ["Recognized Speech", transcript],
    ]

    story.append(make_table(
        transcription_data,
        [50 * mm, 110 * mm],
    ))

    # 3. AI detection results
    story.append(
        Paragraph("3. AI Detection Results", heading_style)
    )

    probability = float(record.get("spoof_probability") or 0) * 100

    detection_data = [
        ["Parameter", "Result"],
        ["Classification", record.get("classification", "Not available")],
        ["Spoof Probability", f"{probability:.2f}%"],
        ["Risk Level", record.get("risk_level", "Not available")],
        ["Detection Threshold", record.get("threshold_used", "Not available")],
    ]

    story.append(make_table(
        detection_data,
        [75 * mm, 85 * mm],
    ))

    # 4. Impersonation risk assessment
    story.append(
        Paragraph("4. Impersonation Risk Assessment", heading_style)
    )

    risk_score = record.get("risk_score")

    if risk_score is None:
        risk_score = probability

    risk_data = [
        ["Parameter", "Result"],
        ["Risk Score", f"{float(risk_score):.2f}/100"],
        ["Risk Severity", record.get("risk_level", "Not available")],
        ["Assessment Basis", record.get(
            "assessment_basis",
            "Random Forest spoof probability",
        )],
    ]

    story.append(make_table(
        risk_data,
        [65 * mm, 95 * mm],
    ))

    # 5. Security recommendations
    story.append(
        Paragraph("5. Security Recommendations", heading_style)
    )

    security_action = safe_text(record.get("security_action"))
    recommendation = safe_text(record.get("recommendation"))

    story.append(
        Paragraph(
            f"<b>Recommended Security Action:</b> {security_action}",
            body_style,
        )
    )

    story.append(
        Paragraph(
            f"<b>Recommendation:</b> {recommendation}",
            body_style,
        )
    )

    risk_level = str(record.get("risk_level", "LOW")).upper()

    if risk_level == "HIGH":
        measures = [
            "Do not authorize financial or sensitive transactions.",
            "Verify identity using an authenticator app or biometric method where available.",
            "Contact the person using a previously verified phone number.",
            "Request manual verification from an authorized person.",
            "Report suspicious impersonation attempts to the appropriate security team.",
        ]
    elif risk_level == "MEDIUM":
        measures = [
            "Request additional identity verification.",
            "Use an OTP sent to a registered contact where available.",
            "Contact the speaker through a trusted communication channel.",
            "Avoid authorizing sensitive requests until verification is complete.",
        ]
    else:
        measures = [
            "Continue normal identity verification.",
            "Use an independent verification method when necessary.",
        ]

    story.append(
        Paragraph("<b>Suggested Security Measures:</b>", body_style)
    )

    for index, measure in enumerate(measures, start=1):
        story.append(
            Paragraph(
                f"{index}. {escape(measure)}",
                body_style,
            )
        )

    # 6. Disclaimer
    story.append(
        Paragraph("6. Model Limitations and Disclaimer", heading_style)
    )

    disclaimer = (
        "This report contains predictions generated by the VoiceShield AI "
        "machine learning model. The spoof probability is an estimate based "
        "on the extracted audio features. The risk score is derived from "
        "spoof probability and is not an independently validated probability "
        "of impersonation. Speech transcription and language identification "
        "are provided separately by Sarvam AI. Transcription does not establish "
        "speaker identity. The model may produce false positives and false "
        "negatives. It is not definitive proof that a voice is genuine, cloned, "
        "or belongs to a particular person. For sensitive or high-risk "
        "communications, always use independent identity verification."
    )

    story.append(Paragraph(disclaimer, body_style))

    # Footer
    story.append(Spacer(1, 15))

    story.append(HRFlowable(
        width="100%",
        thickness=0.5,
        color=colors.HexColor("#9BAFC8"),
    ))

    story.append(Spacer(1, 8))

    story.append(
        Paragraph(
            "Generated by VoiceShield AI | Voice Cloning Detection System",
            subtitle_style,
        )
    )

    document.build(story)

    buffer.seek(0)
    return buffer
