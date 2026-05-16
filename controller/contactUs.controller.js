import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import { sendEmail, sendMessageTemplate } from "../utils/sendEmail.js";
import sendResponse from "../utils/sendResponse.js";

export const contactUs = catchAsync(async (req, res) => {
    const { email, name,phone, message } = req.body;
    // console.log( email, subject, message );
    if (!email || !name || !phone || !message) {
        throw new AppError(400, "Please fill all the fields");
    }
    const to = "tahsin.bdcalling@gmail.com"
    const html = sendMessageTemplate({ email, name,phone, message })
    // console.log(to, html)

    const result = await sendEmail(
       to,
        "Contact From Website",
       html
    );
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "Email sent successfully",
        data: ""
    })
})