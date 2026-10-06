// Trang tạo website — URL riêng `/create-website`.
//
// Trước đây nó là trang GỐC "/", và đó là một lỗi SEO thật: URL có thẩm quyền cao nhất của site
// phục vụ một màn hình chỉ dành cho người đã đăng nhập, còn khách và bot bị 307 sang /welcome.
// Google lập chỉ mục /welcome, còn "/" chỉ là một lần chuyển hướng — giá trị liên kết trỏ về gốc
// bị phân tán, và 307 (TẠM THỜI) là tín hiệu sai cho một cấu trúc cố định.
//
// Nay "/" là trang chủ thật. Trang tạo website về đúng chỗ của nó.
export { default } from "./_home";
