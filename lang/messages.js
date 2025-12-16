const lang = {
  en: {
    notification_payment_success_title_user: "Payment successful",
    notification_payment_success_desc_user: (amount, orderNumber) =>
      `Your payment of ${amount} EGP for order #${orderNumber} was successful.`,
    notification_payment_success_title_admin: "Order paid",
    notification_payment_success_desc_admin: (orderNumber, amount) =>
      `Order #${orderNumber} was paid successfully. Amount: ${amount} EGP`,
    notification_category_created_title: "New Category Created",
    notification_category_created_desc: (fullname, categoryName) =>
      `${fullname} has created a new category: ${categoryName}.`,
    notification_category_updated_title: "Category Updated",
    notification_category_updated_desc: (fullname, categoryName) =>
      `${fullname} has updated the category: ${categoryName}.`,
    notification_product_created_title: "New Product Created",
    notification_product_created_desc: (fullname, productName) =>
      `${fullname} has created a new product: ${productName}.`,
    notification_order_created_title_user: "Order Placed",
    notification_order_created_desc_user: (totalAmount) =>
      `Your order has been created successfully. Total amount: ${totalAmount}.`,
    notification_order_created_title: "New Order Received",
    notification_order_created_desc: (fullname, totalAmount) =>
      `${fullname} has placed a new order. Total amount: ${totalAmount}.`,
    notification_order_Cancelled_title: "Order Cancelled",
    notification_order_Cancelled_desc_user: (orderId) =>
      `Your order #${orderId} has been cancelled. Contact support if this was a mistake.`,
    notification_order_Cancelled_desc: (orderId, userFullname) =>
      `Order #${orderId} by ${userFullname} was cancelled`,
    notification_order_status_title: (status) => `Order ${status}`,
    notification_order_status_desc_user: (orderId, status) =>
      `Your order #${orderId} is now ${status.toLowerCase()}.`,
    notification_order_status_desc: (orderId, status) =>
      `Order #${orderId} is now ${status.toLowerCase()}.`,

    notification_product_updated_title: "Product Updated",
    notification_product_updated_desc: (fullname, productName) =>
      `${fullname} updated the product: ${productName}`,
    user_isBlocked: "This account is blocked.",
    internalError: "Server error, please try again.",
    name_required: "Name is required",
    name_too_long: "Name cannot be longer than 100 characters",
    password_too_short: "Password must be at least 6 characters long",
    new_password_too_short: "New Password must be at least 6 characters long",
    new_password_too_long: "New Password cannot be longer than 100 characters",
    invalid_phone: "invalid phone number.",
    phone_or_email: "Please enter a valid phone number or email address",
    invalid_email: "Email address is not valid",
    check_email: "Check you email address for OTP",
    check_phone: "Check you SMS for OTP",
    phone_already_used: "This phone number is already used",
    email_already_used: "This email address is already used",
    invalid_userId: "The userId is invalid",
    user_not_found: "User not found. Please sign-up.",
    invalid_password: "incorrect password",
    locked_account: (times, duration) => {
      return `Your account is locked after ${times} failed attempts.
Try again in ${duration} minutes or reset your password.`;
    },
    locked_message_reminder: (attemps, times) => {
      return `You have ${attemps} out of ${times} attempts remaining.`;
    },
    login_success: "successfully login",
    provide_token: "Please provide token.",
    password_has_been_changed:
      "your password has been changed, please login agian...",
    not_authorized: "You are not authorized to access this content.",
    Invalid_code: "Invalid code. Please check and try again.",
    Expired_code: "expired code.",
    notfound_code: "Incorrect code. Please check and try again",
    code_success: "Your code is successfully",
    success_send_opt: "Code sent successfully",
    success_confirm: "successfully confirmed your phone number",
    already_confirmed: "You have already confirmed your account.",
    user_deleted: "user deleted successfully.",
    update_password: "Password updated successfully",
    category_name: "Please provide the category name.",
    category_created: "category created successfully",
    category_updated: "category updated successfully",
    category_image_required: "Please provide the category image",
    category_not_found: "category not found",
    success_delete_category: "Successfully deleted the category.",
    invalid_url: "invalid url",
    invalid_date: "invalid date",
    invalid_status: "invalid status",
    very_later_reset_password: "Please try again later...",

    // Support Ticket Messages
    ticket_created: "Support ticket created successfully",
    ticket_updated: "Ticket updated successfully",
    ticket_not_found: "Ticket not found",
    ticket_closed: "Ticket closed successfully",
    message_sent_success: "Message sent successfully",
    messages_marked_read: "Messages marked as read",
    not_allowed: "You are not allowed to perform this action",
    message_required: "Message content is required",
    ticket_already_closed: "This ticket is already closed",
    ticket_assigned: "Ticket assigned successfully",
    onBoarding_title_required: "The onboarding title is required.",
    onBoarding_content_required: "The onboarding content is required.",
    onBoarding_image_required: "Please provide the on-boarding image",
    onBoarding_success_created: "Successfully created the onboarding",
    onBoarding_success_updated: "Successfully updated the onboarding",
    onBoarding_notFound: "onBoarding not found",
    onBoarding_success_delete: "Successfully deleted the onboarding",
    title_required: "Title is required and cannot be empty.",
    title_too_long: "Title cannot exceed 255 characters.",
    description_required: "Description is required and cannot be empty.",
    image_url_required: "Image URL is required and cannot be empty.",
    invalid_image_url: "The provided image URL is invalid.",
    ad_created: "Ad successfully created.",
    ad_updated: "Ad successfully updated.",
    ad_deleted: "Ad successfully deleted.",
    invalid_amount: "The amount invalid",
    session_expired: "The session is invalid.",
    invalid_token_format: "The token format is invalid",
    ads_description_is_required: "Description cannot be empty",
    ads_target_url_is_required: "Target URL cannot be empty",
    ads_target_url_is_Invalid: "Target URL is invalid",
    ads_budget: "Budget must be a positive number",
    ads_priority: "Priority must be a positive number",
    ads_times_required: "Timing must be a non-negative integer",
    ads_times_display_duration:
      "Display duration must be a non-negative integer",
    ads_image_required: "Image is required",
    ads_create_success: "successfully AD created",
    ad_not_found: "AD not found",
    wallet_history_notfound: "Wallet history not found",
    this_point_expired: "This point has expired",
    this_point_is_gift: "This point is a gift point",
    recharge_invalid_amount: "invalid amount data. must be a number",
    faqs_question_required: "faqs_question_required",
    faqs_answer_required: "faqs_answer_required",
    faqs_language: "Invalid language.",
    faqs_success_message: "successfully faqs added",
    faqs_updated_message: "successfully faqs updated",
    faqs_deleted_message: "successfully faqs deleted",
    faqs_not_found_message: "Faqs not found",
    contact_us_message: "message is Required",
    contact_us_success: "successfully message sended",

    // Contact Us specific messages
    subject_required: "Subject is required",
    response_required: "Response is required",
    contact_not_found: "Contact message not found",
    contact_already_responded: "This contact has already been responded to",
    contact_updated_success: "Contact updated successfully",
    response_sent_success: "Response sent successfully",
    successfully_deleted_contact: "Contact deleted successfully",
    insufficient_balance: "Insufficient balance",
    user_type_buyAmount: "user type buyAmount is required",
    user_type_ratio: "user type ratio is required",
    user_type_color: "user type color is required",
    no_user_types_found: "no user types found",
    not_found_userType: "not found user type",
    success: "Action successful",
    user_type_userType: "user type userType is required",
    already_representative: (brandName) =>
      `This user Already representative for ${brandName}`,
    not_representative: "This user already representative ",
    success_deleted: "This representive has been deleted from the brand",
    code_is_required: "Code is required",
    codeInvalid: "Code Invalid",
    notFound: "not Found",
    special_offer_brand_id: "Enter vaild brand name",
    special_offer_user_type: "Enter vaild user type name",
    special_offer_ratio: "Enter vaild ratio",
    special_offer_valid_to: "Enter vaild valid to",
    special_offer_valid_from: "Enter vaild valid from",
    special_offer_exist:
      "the special offer exists you can just update or delete it",
    special_offer_notExist: "the special offer is not exists.",
    exclusive_offer_exist:
      "the exclusive offer exists you can just update or delete it",
    exclusive_offer_notExist: "the exclusive offer is not exists.",
    notification_offer_brand: (brandName, ratio) =>
      `${brandName} announces new brand offer with ${ratio}% discount`,
    notification_offer_brand_desc: (brandName, category, ratio) =>
      `${brandName} is offering ${ratio}% discount in ${category}`,
    notification_payment_success_title: (username, amount, brandName) =>
      `${username} bought in ${amount} amount from ${brandName}.`,
    notification_payment_success_desc: (
      username,
      amount,
      points,
      brandName,
      validFrom
    ) =>
      `${username} bought in ${amount} amount from ${brandName} and earned ${points} points. Valid from: ${validFrom}`,
    notification_payment_success_title_points: (username, points, brandName) =>
      `${username} bought in ${points} points from ${brandName}.`,
    notification_payment_success_desc_points: (username, points, brandName) =>
      `${username} bought in ${points} points from ${brandName}.`,
    notification_payment_success_title_points_user: (brandName) =>
      `Points Redemption Successful at ${brandName}!`,
    notification_payment_success_desc_points_user: (points, brandName) =>
      `You've successfully redeemed ${points} points towards your purchase at ${brandName}. Thank you for your loyalty!`,
    notification_special_offer_title: (brandName, userType) =>
      `${brandName} make special offer for ${userType} users`,
    notification_special_offer_desc: (brandName, ratio, userType) =>
      `${brandName} make special offer with ${ratio}% for users type ${userType}`,
    notification_special_offer_title_edit: (brandName, userType) =>
      `${brandName} Edit special offer for ${userType} users`,
    notification_special_offer_desc_edit: (brandName, ratio, userType) =>
      `${brandName} Edit special offer with ${ratio}% for users type ${userType}`,
    notification_custom_offer_title: (brandName, userType) =>
      `${brandName} announces custom offer for ${userType} users`,
    notification_custom_offer_desc: (brandName, ratio, userType) =>
      `${brandName} is offering ${ratio}% discount for ${userType} users`,
    notification_custom_offer_title_edit: (brandName, userType) =>
      `${brandName} updates custom offer for ${userType} users`,
    notification_custom_offer_desc_edit: (brandName, ratio, userType) =>
      `${brandName} has updated the discount to ${ratio}% for ${userType} users`,
    notification_digital_seals_title: (brandName, count) =>
      `${brandName} offers digital seal reward after ${count} purchases`,
    notification_digital_seals_desc: (brandName, ratio, count) =>
      `${brandName} offers ${ratio}% reward after completing ${count} purchases`,
    notification_digital_seals_title_edit: (brandName, count) =>
      `${brandName} updated digital seal reward for ${count} purchases`,
    notification_digital_seals_desc_edit: (brandName, ratio, count) =>
      `${brandName} updated reward to ${ratio}% after ${count} purchases`,
    notification_coupon_title: (brandName, ratio) =>
      `${brandName} announces new coupon with ${ratio}% discount`,
    notification_coupon_desc: (brandName, ratio, code) =>
      `Use code "${code}" to get ${ratio}% discount at ${brandName}`,
    notification_coupon_title_edit: (brandName, ratio) =>
      `${brandName} updates coupon discount to ${ratio}%`,
    notification_coupon_desc_edit: (brandName, ratio, code) =>
      `Updated coupon code "${code}" now offers ${ratio}% discount at ${brandName}`,
    notification_exclusive_offer_title: (brandName) =>
      `${brandName} make exclusive offer for users`,
    notification_exclusive_offer_desc: (brandName, ratio) =>
      `${brandName} make exclusive offer with ${ratio}% for users`,
    notification_exclusive_offer_title_edit: (brandName) =>
      `${brandName} Edit exclusive offer for users`,
    notification_exclusive_offer_desc_edit: (brandName, ratio) =>
      `${brandName} Edit exclusive offer with ${ratio}% for users`,
    notification_resent_successfully:
      "Notification has been resent successfully",
    notification_updated: "Notification has been updated successfully",
    notification_deleted: "Notification has been deleted successfully",
    no_notifications_to_delete: "No notifications to delete",
    notifications_deleted: "Notifications have been deleted successfully",
    delete_success: {
      en: "Representative deleted successfully",
      ar: "تم حذف الممثل بنجاح",
    },
    not_found: {
      en: "Representative not found",
      ar: "الممثل غير موجود",
    },
    update_success: {
      en: "Representative updated successfully",
      ar: "تم تحديث الممثل بنجاح",
    },
    wallet_update_title_user: "Wallet Balance Updated",
    wallet_update_points_title_user: "Points Balance Updated",
    wallet_update_desc_user: (oldAmount, newAmount) =>
      `Your wallet balance has changed from ${oldAmount} to ${newAmount}.`,
    wallet_update_points_desc_user: (oldPoints, newPoints) =>
      `Your points balance has changed from ${oldPoints} to ${newPoints}.`,
    wallet_update_title: "Wallet Updated by Admin",
    wallet_update_points_title: "Points Updated by Admin",
    wallet_update_desc: (adminName, oldAmount, newAmount, username) =>
      `Admin ${adminName} updated ${username}'s wallet balance from ${oldAmount} to ${newAmount}.`,
    wallet_update_points_desc: (adminName, oldPoints, newPoints, username) =>
      `Admin ${adminName} updated ${username}'s points from ${oldPoints} to ${newPoints}.`,
    // Points expiration notifications
    notification_points_expiring_title: (fullname) =>
      `Hello ${fullname}, Your Points Are Expiring Soon!`,
    notification_points_expiring_desc: (points, date) =>
      `${points} points will expire on ${date}. Use them before they're gone!`,
    // Points available notifications
    notification_points_available_title: (fullname) =>
      `Hello ${fullname}, Your Points Are Now Available!`,
    notification_points_available_desc: (points, brands) =>
      `${points} points from ${brands} are now available in your wallet. Start using them today!`,
    notification_admin_available_points_summary_title: (usersCount) =>
      `Daily Points Available Report: ${usersCount} Users Notified`,
    notification_admin_available_points_summary_desc: (
      usersCount,
      date,
      totalPoints
    ) =>
      `${usersCount} users were notified about ${totalPoints} points becoming available on ${date}`,
    notification_admin_expiring_points_summary_title: (usersCount) =>
      `Daily Points Expiration Report: ${usersCount} Users Notified`,
    notification_admin_expiring_points_summary_desc: (
      usersCount,
      date,
      totalPoints
    ) =>
      `${usersCount} users were notified about ${totalPoints} points expiring on ${date}`,
    notification_admin_job_error_title: (jobName) =>
      `System Job Error: ${jobName}`,
    notification_admin_job_error_desc: (jobName, errorMessage) =>
      `The ${jobName} job encountered an error: ${errorMessage}`,

    // Cart related messages
    product_id_required: "Product ID is required",
    quantity_min: "Quantity must be at least 1",
    quantity_must_be_positive: "Quantity must be a positive number",
    quantity_cannot_be_zero:
      "Quantity cannot be zero. Use positive numbers to add items or negative numbers to remove items",
    product_already_in_cart: "Product is already in your cart",
    use_put_to_update: "Use PUT method to update existing cart items",
    cart_item_added: "Item added to cart successfully",
    cart_item_updated: "Cart item updated successfully",
    cart_item_removed: "Item removed from cart successfully",
    cart_item_not_found: "Cart item not found",
    cart_cleared: "Cart cleared successfully",
    insufficient_stock: "Insufficient stock available",
    quantity_adjusted_to_stock: "Quantity adjusted to available stock",
    invalid_action:
      "Invalid action. Must be 'increment', 'decrement', or 'set'",

    // Wishlist related messages
    product_added_to_wishlist: "Product added to wishlist successfully",
    product_removed_from_wishlist: "Product removed from wishlist successfully",
    wishlist_item_not_found: "Wishlist item not found",
    wishlist_cleared: "Wishlist cleared successfully",
  },
  ar: {
    notification_payment_success_title_user: "تم الدفع بنجاح",
    notification_payment_success_desc_user: (amount, orderNumber) =>
      `تم استلام دفعة بقيمة ${amount} جنيه للطلب رقم ${orderNumber}.`,
    notification_payment_success_title_admin: "تم دفع الطلب",
    notification_payment_success_desc_admin: (orderNumber, amount) =>
      `تم دفع الطلب رقم ${orderNumber} بنجاح. المبلغ: ${amount} جنيه`,

    notification_category_created_title: "تم إنشاء فئة جديدة",
    notification_category_created_desc: (fullname, categoryName) =>
      `${fullname} قام بإنشاء فئة جديدة: ${categoryName}.`,
    notification_category_updated_title: "تم تحديث الفئة",
    notification_category_updated_desc: (fullname, categoryName) =>
      `${fullname} قام بتحديث الفئة: ${categoryName}.`,
    notification_product_created_title: "تم إنشاء منتج جديد",
    notification_product_created_desc: (fullname, productName) =>
      `${fullname} قام بإنشاء منتج جديد: ${productName}.`,
    notification_order_created_title_user: "تم إنشاء الطلب",
    notification_order_created_desc_user: (totalAmount) =>
      `تم إنشاء طلبك بنجاح. المبلغ الإجمالي: ${totalAmount}.`,
    notification_order_created_title: "طلب جديد",
    notification_order_created_desc: (fullname, totalAmount) =>
      `${fullname} قام بإنشاء طلب جديد. المبلغ الإجمالي: ${totalAmount}.`,

    notification_order_Cancelled_title: "تم إلغاء الطلب",
    notification_order_Cancelled_desc_user: (orderId) =>
      `تم إلغاء الطلب رقم ${orderId}. إذا كان هذا عن طريق الخطأ، يرجى التواصل مع الدعم.`,
    notification_order_Cancelled_desc: (orderId, userFullname) =>
      `قام ${userFullname} بإلغاء الطلب رقم ${orderId}.`,
    notification_order_status_title: (status) => `الطلب ${status}`,
    notification_order_status_desc_user: (orderId, status) =>
      `طلبك رقم ${orderId} الآن في حالة "${status}".`,
    notification_order_status_desc: (orderId, status) =>
      `طلب #${orderId} الآن في حالة ${status.toLowerCase()}.`,

    notification_product_updated_title: "تم تحديث المنتج",
    notification_product_updated_desc: (fullname, productName) =>
      `${fullname} قام بتحديث المنتج: ${productName}`,
    remaining_points_fetched: "تم جلب النقاط المتبقية بنجاح.",
    offer_ratio_exceeds_point_back_up_to: (remaining, limit) =>
      `نسبة العرض تتجاوز حد استرداد النقاط للعلامة التجارية. المتبقي حتى: ${remaining} والحد هو ${limit}`,
    offer_ratio_exceeds_limit: (limit) =>
      `نسبة العرض تتجاوز الحد. يرجى ضبط النسبة. الحد هو ${limit}.`,
    overlapping_offer: (validFrom, validTo) =>
      `يوجد عرض متداخل مع التواريخ المحددة. يرجى اختيار تواريخ مختلفة. العرض المتداخل يبدأ من ${validFrom} إلى ${validTo}.`,
    offer_outside_brand_period: (validFrom, validTo) =>
      `تاريخ العرض خارج فترة صلاحية العلامة التجارية. صلاحية العلامة التجارية من: ${validFrom}، إلى: ${validTo}`,
    user_isBlocked: "تم حظر المستخدم",
    notification_resent_successfully: "تم إعادة إرسال الإشعار بنجاح",
    notification_updated: "تم تحديث الإشعار بنجاح",
    notification_deleted: " تم حذف الإشعار بنجاح",
    notification_offer_brand: (brandName, ratio) =>
      `${brandName} يقدم عرضًا بخصم ${ratio}%`,
    notification_offer_brand_desc: (brandName, category, ratio) =>
      `ماركة ${brandName} قدمت عرضًا في ${category} بنسبة ${ratio}%`,
    notification_payment_success_title: (username, amount, brandName) =>
      `${username} اشترى بمبلغ ${amount} من ${brandName}.`,
    notification_payment_success_desc: (
      username,
      amount,
      points,
      brandName,
      validFrom
    ) =>
      `${username} اشترى بمبلغ ${amount} من ${brandName} وحصل على ${points} نقاط. سارية من: ${validFrom}`,
    notification_payment_success_title_points: (username, points, brandName) =>
      `${username} اشترى بمبلغ ${points} نقطة من ${brandName}.`,
    notification_payment_success_desc_points: (username, points, brandName) =>
      `${username} اشترى بمبلغ ${points} نقطة من ${brandName}.`,

    notification_payment_success_title_points_user: (brandName) =>
      `تم استبدال النقاط بنجاح في ${brandName}!`,
    notification_payment_success_desc_points_user: (points, brandName) =>
      `لقد نجحت في استبدال ${points} نقطة في مشترياتك في ${brandName}. شكراً لولائك!`,
    internalError: "خطأ في الخادم، يرجى المحاولة مرة أخرى",
    name_required: "الاسم مطلوب",
    name_too_long: "لا يمكن أن يتجاوز الاسم 100 حرف",
    password_too_short: "يجب أن تكون كلمة المرور 6 أحرف على الأقل",
    new_password_too_short: "يجب أن تكون كلمة المرور الجديدة 6 أحرف على الأقل",
    new_password_too_long: "لا يمكن أن تتجاوز كلمة المرور الجديدة 100 حرف",
    invalid_phone: "رقم الهاتف غير صالح",
    phone_or_email: "يرجى إدخال رقم هاتف أو بريد إلكتروني صالح",
    invalid_email: "البريد الإلكتروني غير صالح",
    check_email: "تحقق من بريدك الإلكتروني للحصول على رمز التحقق",
    check_phone: "تحقق من رسائل SMS للحصول على رمز التحقق",
    phone_already_used: "رقم الهاتف مستخدم بالفعل",
    email_already_used: "البريد الإلكتروني مستخدم بالفعل",
    Invalid_uid: "معرف المستخدم غير صالح",
    invalid_userId: "معرف المستخدم غير صالح",
    totalPirce_required: "السعر الإجمالي مطلوب",
    check_your_phone: "يرجى التحقق من هاتفك للحصول على رمز التحقق",
    user_not_found: "المستخدم غير موجود. يرجى التسجيل",
    invalid_password: "كلمة المرور غير صحيحة",
    locked_account: (times, duration) => {
      return `تم قفل حسابك بعد ${times} محاولات فاشلة.
  حاول مرة أخرى بعد ${duration} دقائق أو قم بإعادة تعيين كلمة المرور`;
    },
    locked_message_reminder: (attemps, times) => {
      return `لديك ${attemps} من أصل ${times} محاولات متبقية`;
    },
    login_success: "تم تسجيل الدخول بنجاح",
    provide_token: "(token) يرجى توفير",
    password_has_been_changed:
      "تم تغيير كلمة المرور الخاصة بك، يرجى تسجيل الدخول مرة أخرى",
    not_authorized: "غير مصرح لك بالوصول إلى هذا المحتوى",
    Invalid_code: "رمز غير صالح. يرجى التحقق والمحاولة مرة أخرى",
    Expired_code: "الرمز منتهي الصلاحية",
    notfound_code: "رمز غير صحيح. يرجى التحقق والمحاولة مرة أخرى",
    code_success: "الرمز الخاص بك صحيح",
    success_send_opt: "تم إرسال الرمز بنجاح",
    success_confirm: "تم تأكيد رقم هاتفك بنجاح",
    already_confirmed: "لقد قمت بتأكيد حسابك بالفعل",
    not_allowed: "غير مسموح لك بالوصول إلى هذا المحتوى",
    qr_msg: "يرجى إدخال رمز QR",
    user_deleted: "تم حذف المستخدم بنجاح",
    update_password: "تم تحديث كلمة المرور بنجاح",
    brand_name: "يرجى تقديم اسم العلامة التجارية",
    brand_phone: "يرجى تقديم رقم هاتف العلامة التجارية",
    brand_email: "يرجى تقديم بريد إلكتروني صالح للعلامة التجارية",
    brand_url: "يرجى تقديم رابط العلامة التجارية",
    brand_about: "يرجى تقديم تفاصيل عن العلامة التجارية",
    brand_terms: "يرجى تقديم شروط استرداد النقاط للعلامة التجارية",
    brand_address: "يرجى تقديم عنوان العلامة التجارية",
    brand_lat: "يرجى تقديم خط العرض لموقع العلامة التجارية",
    brand_lang: "يرجى تقديم خط الطول لموقع العلامة التجارية",
    brand_valid_from: "يرجى تقديم تاريخ بداية صلاحية العلامة التجارية",
    brand_Invalid_from: "تاريخ البداية غير صالح",
    brand_Invalid_to: "تاريخ النهاية غير صالح",
    brand_not_found: "العلامة التجارية غير موجودة",
    brand_id_invalid: "يجب أن يكون معرف العلامة التجارية رقمًا صالحًا",
    brand_ratio: "نسبة العلامة التجارية ليست رقمًا",
    brand_point_back_ratio: "نسبة استرداد النقاط ليست رقمًا",
    brand_validity_period: "فترة صلاحية العلامة التجارية ليست رقمًا",
    success_created_brand: "تم إنشاء العلامة التجارية بنجاح",
    success_updated_brand: "تم تحديث العلامة التجارية بنجاح",
    success_delete_brand: "تم حذف العلامة التجارية بنجاح",
    notification_special_offer_title: (brandName, userType) =>
      `${brandName} يقدم عرضًا خاصًا لمستخدمي ${userType}`,
    notification_special_offer_desc: (brandName, ratio, userType) =>
      `${brandName} يقدم عرضًا خاصًا بنسبة ${ratio}% لمستخدمي ${userType}`,
    wallet_update_title_user: "تم تحديث المحفظة",
    wallet_update_points_title_user: "تم تحديث النقاط",
    wallet_update_desc_user: (amount) =>
      `تم تحديث رصيد محفظتك بمقدار ${amount}.`,
    wallet_update_points_desc_user: (points) =>
      `تم تغيير رصيد نقاطك بمقدار ${points}.`,
    wallet_update_title: "تم تحديث المحفظة بواسطة المشرف",
    wallet_update_points_title: "تم تحديث النقاط بواسطة المشرف",
    wallet_update_desc: (adminName, amount, username) =>
      `قام المشرف ${adminName} بتحديث محفظة ${username} بمقدار ${amount}.`,
    wallet_update_points_desc: (adminName, points, username) =>
      `قام المشرف ${adminName} بتحديث نقاط ${username} بمقدار ${points}.`,
    // إشعارات انتهاء صلاحية النقاط
    notification_points_expiring_title: (fullname) =>
      `مرحباً ${fullname}، نقاطك ستنتهي قريباً!`,
    notification_points_expiring_desc: (points, date) =>
      `${points} نقطة ستنتهي صلاحيتها في ${date}. استخدمها قبل انتهاء صلاحيتها!`,
    // إشعارات توافر النقاط
    notification_points_available_title: (fullname) =>
      `مرحباً ${fullname}، نقاطك متاحة الآن!`,
    notification_points_available_desc: (points, brands) =>
      `${points} نقطة من ${brands} متاحة الآن في محفظتك. ابدأ في استخدامها اليوم!`,
    notification_admin_available_points_summary_title: (usersCount) =>
      `تقرير توافر النقاط اليومي: تم إشعار ${usersCount} مستخدم`,
    notification_admin_available_points_summary_desc: (
      usersCount,
      date,
      totalPoints
    ) =>
      `تم إشعار ${usersCount} مستخدم حول توافر ${totalPoints} نقطة في ${date}`,
    notification_admin_expiring_points_summary_title: (usersCount) =>
      `تقرير انتهاء صلاحية النقاط اليومي: تم إشعار ${usersCount} مستخدم`,
    notification_admin_expiring_points_summary_desc: (
      usersCount,
      date,
      totalPoints
    ) =>
      `تم إشعار ${usersCount} مستخدم حول انتهاء صلاحية ${totalPoints} نقطة في ${date}`,
    notification_admin_job_error_title: (jobName) =>
      `خطأ في مهمة النظام: ${jobName}`,
    notification_admin_job_error_desc: (jobName, errorMessage) =>
      `واجهت مهمة ${jobName} خطأ: ${errorMessage}`,

    // Cart related messages - Arabic
    product_id_required: "معرف المنتج مطلوب",
    quantity_min: "الكمية يجب أن تكون على الأقل 1",
    quantity_must_be_positive: "الكمية يجب أن تكون رقماً موجباً",
    quantity_cannot_be_zero:
      "الكمية لا يمكن أن تكون صفراً. استخدم أرقام موجبة لإضافة العناصر أو أرقام سالبة لإزالة العناصر",
    product_already_in_cart: "المنتج موجود بالفعل في السلة",
    use_put_to_update: "استخدم طريقة PUT لتحديث عناصر السلة الموجودة",
    cart_item_added: "تم إضافة العنصر إلى السلة بنجاح",
    cart_item_updated: "تم تحديث عنصر السلة بنجاح",
    cart_item_removed: "تم إزالة العنصر من السلة بنجاح",
    cart_item_not_found: "عنصر السلة غير موجود",
    cart_cleared: "تم مسح السلة بنجاح",
    insufficient_stock: "المخزون غير كافي",
    quantity_adjusted_to_stock: "تم تعديل الكمية حسب المخزون المتاح",
    invalid_action:
      "إجراء غير صحيح. يجب أن يكون 'increment' أو 'decrement' أو 'set'",

    // Wishlist related messages - Arabic
    product_added_to_wishlist: "تم إضافة المنتج إلى قائمة الرغبات بنجاح",
    product_removed_from_wishlist: "تم إزالة المنتج من قائمة الرغبات بنجاح",
    product_already_in_wishlist: "المنتج موجود بالفعل في قائمة الرغبات",
    wishlist_item_not_found: "عنصر قائمة الرغبات غير موجود",
    wishlist_cleared: "تم مسح قائمة الرغبات بنجاح",

    // Support Ticket Messages - Arabic
    ticket_created: "تم إنشاء تذكرة الدعم بنجاح",
    ticket_updated: "تم تحديث التذكرة بنجاح",
    ticket_not_found: "التذكرة غير موجودة",
    ticket_closed: "تم إغلاق التذكرة بنجاح",
    message_sent_success: "تم إرسال الرسالة بنجاح",
    messages_marked_read: "تم تعليم الرسائل كمقروءة",
    message_required: "محتوى الرسالة مطلوب",
    ticket_already_closed: "هذه التذكرة مغلقة بالفعل",
    ticket_assigned: "تم تعيين التذكرة بنجاح",

    // Contact Us specific messages - Arabic (Legacy - for backwards compatibility)
    contact_us_message: "الرسالة مطلوبة",
    contact_us_success: "تم إرسال الرسالة بنجاح",
    subject_required: "الموضوع مطلوب",
    response_required: "الرد مطلوب",
    contact_not_found: "رسالة التواصل غير موجودة",
    contact_already_responded: "تم الرد على هذه الرسالة بالفعل",
    contact_updated_success: "تم تحديث رسالة التواصل بنجاح",
    response_sent_success: "تم إرسال الرد بنجاح",
    successfully_deleted_contact: "تم حذف رسالة التواصل بنجاح",
  },
};
export default lang;
