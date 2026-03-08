import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { to, subject, body, hiringManagerName } = await req.json();

    if (!to || !subject || !body) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, subject, body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      console.log(`Invalid email address skipped: ${to}`);
      return new Response(JSON.stringify({ 
        success: false,
        error: `Invalid email address: ${to}`,
        sent: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!GMAIL_APP_PASSWORD) {
      return new Response(JSON.stringify({ error: "GMAIL_APP_PASSWORD not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const senderEmail = "husnainmahavia.1@gmail.com";
    const senderName = "Husnain Mahavia";

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: senderEmail,
        pass: GMAIL_APP_PASSWORD,
      },
    });

    const htmlBody = body.replace(/\n/g, "<br>");

    const info = await transporter.sendMail({
      from: `${senderName} <${senderEmail}>`,
      to: to,
      subject: subject,
      text: body,
      html: htmlBody,
    });

    console.log(`Email SENT to ${to} - Subject: ${subject} - MessageId: ${info.messageId}`);

    return new Response(JSON.stringify({ 
      success: true,
      message: `Email sent to ${hiringManagerName || to}`,
      sent: true,
      messageId: info.messageId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Failed to send email";
    console.error("Email send error:", errorMsg);
    
    // Check if it's a bounce/recipient error vs auth error
    const isBounce = errorMsg.includes("550") || errorMsg.includes("553") || 
                     errorMsg.includes("mailbox not found") || errorMsg.includes("User unknown");
    
    return new Response(JSON.stringify({ 
      error: errorMsg,
      sent: false,
      bounce: isBounce,
    }), {
      status: isBounce ? 200 : 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
