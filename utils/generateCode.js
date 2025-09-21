function generateCode(length = 6) {
    if (length <= 0) {
        throw new Error("Length must be a positive number.");
    }

    let min = Math.pow(10, length - 1);
    let max = Math.pow(10, length) - 1;

    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export default generateCode