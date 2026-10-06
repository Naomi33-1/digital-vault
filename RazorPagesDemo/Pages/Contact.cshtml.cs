using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.ComponentModel.DataAnnotations;

namespace RazorPagesDemo.Pages
{
    public class ContactModel : PageModel
    {
        // Связывает свойство с данными формы. Атрибуты ниже обеспечивают валидацию.
        [BindProperty]
        [Required(ErrorMessage = "Поле 'Сообщение' обязательно для заполнения.")]
        [StringLength(200, ErrorMessage = "Максимальная длина — 200 символов.")]
        public string Message { get; set; } = string.Empty;

        // Выполняется при обычном открытии страницы (GET-запрос)
        public void OnGet()
        {
            Message = "Привет! Напишите нам.";
        }

        // Выполняется при нажатии кнопки "Отправить" (POST-запрос)
        public IActionResult OnPost()
        {
            // Если данные не прошли проверку (например, поле пустое), возвращаем страницу с ошибками
            if (!ModelState.IsValid)
            {
                return Page(); 
            }

            // Здесь будет код сохранения в БД (для курсового это можно описать как "интеграция с модулем доступа к данным")
            
            // Перенаправляем на страницу успеха (паттерн Post-Redirect-Get)
            return RedirectToPage("./Success");
        }
    }
}