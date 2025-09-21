import parsePhoneNumber from 'libphonenumber-js';

const codes = ["+2", '+966'];

export const isValidPhone = (phone) => {
    let isValid = false;
    let ph = phone;
    codes.forEach(el => {
        if (parsePhoneNumber(`${el}${phone}`)?.isValid()) {
            isValid = true;
            ph = `${el}${phone}`
        }
    })
    return { isValid, phone: ph };
}